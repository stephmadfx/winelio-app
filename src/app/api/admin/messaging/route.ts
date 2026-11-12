import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteAvatar } from "@/lib/r2-avatars";
import {
  broadcastChannelUpdate,
  formatMemberDisplayName,
  getMessagingActor,
  logMessagingAudit,
  MESSAGING_GROUPS_ENABLED,
} from "@/lib/messaging";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  try {
    const actor = await getMessagingActor();
    if (!actor || !actor.isSuperAdmin) {
      return NextResponse.json({ error: "Accès réservé aux Super Admins" }, { status: 403 });
    }

    let channelsAdminQuery = supabaseAdmin
      .from("messaging_channels")
      .select("id, kind, slug, name, description, allow_member_photos, is_archived, last_message_at, created_at")
      .order("kind", { ascending: true })
      .order("name", { ascending: true });

    if (!MESSAGING_GROUPS_ENABLED) {
      channelsAdminQuery = channelsAdminQuery.eq("kind", "announcements");
    }

    const [
      { data: channels },
      { data: memberships },
      { data: messagesMeta },
      { data: reports },
      { data: restrictions },
      { data: superAdminRows },
    ] = await Promise.all([
      channelsAdminQuery,
      supabaseAdmin.from("messaging_memberships").select("channel_id"),
      supabaseAdmin
        .from("messaging_messages")
        .select("channel_id")
        .is("deleted_at", null)
        .eq("moderation_state", "active"),
      supabaseAdmin
        .from("messaging_reports")
        .select(
          "id, message_id, channel_id, reporter_id, reason, details, status, resolved_by, resolved_at, resolution_note, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("messaging_restrictions")
        .select("id, user_id, channel_id, restricted_until, reason, created_at")
        .gt("restricted_until", new Date().toISOString())
        .order("created_at", { ascending: false }),
      supabaseAdmin.rpc("get_super_admin_reviewers"),
    ]);

    const memberCountMap = new Map<string, number>();
    for (const m of memberships ?? []) {
      memberCountMap.set(m.channel_id, (memberCountMap.get(m.channel_id) ?? 0) + 1);
    }

    const messageCountMap = new Map<string, number>();
    for (const msg of messagesMeta ?? []) {
      messageCountMap.set(msg.channel_id, (messageCountMap.get(msg.channel_id) ?? 0) + 1);
    }

    const reportMessageIds = Array.from(new Set((reports ?? []).map((r) => r.message_id)));
    const { data: reportedMessages } =
      reportMessageIds.length > 0
        ? await supabaseAdmin
            .from("messaging_messages")
            .select(
              "id, author_id, content, archived_content, attachments, deleted_at, moderation_state, created_at",
            )
            .in("id", reportMessageIds)
        : {
            data: [] as {
              id: string;
              author_id: string | null;
              content: string;
              archived_content: string | null;
              attachments: unknown;
              deleted_at: string | null;
              moderation_state: string | null;
              created_at: string;
            }[],
          };

    const msgMap = new Map((reportedMessages ?? []).map((m) => [m.id, m]));

    const userIdsToResolve = Array.from(
      new Set(
        [
          ...(reports ?? []).map((r) => r.reporter_id),
          ...(reports ?? []).map((r) => r.resolved_by),
          ...(reportedMessages ?? []).map((m) => m.author_id),
          ...(restrictions ?? []).map((r) => r.user_id),
        ].filter((id): id is string => Boolean(id)),
      ),
    );

    const { data: profiles } =
      userIdsToResolve.length > 0
        ? await supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name, email")
            .in("id", userIdsToResolve)
        : {
            data: [] as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              email: string;
            }[],
          };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const channelMap = new Map((channels ?? []).map((c) => [c.id, c]));

    const superAdmins = (
      (superAdminRows ?? []) as { user_id: string; email: string; display_name: string }[]
    ).map((sa) => ({
      userId: sa.user_id,
      email: sa.email,
      displayName: sa.display_name,
    }));

    return NextResponse.json({
      groupsEnabled: MESSAGING_GROUPS_ENABLED,
      superAdmins,
      channels: (channels ?? []).map((ch) => ({
        ...ch,
        memberCount: memberCountMap.get(ch.id) ?? 0,
        messageCount: messageCountMap.get(ch.id) ?? 0,
      })),
      reports: (reports ?? []).map((r) => {
        const msg = msgMap.get(r.message_id);
        const authorProf = msg?.author_id ? profileMap.get(msg.author_id) : null;
        const reporterProf = profileMap.get(r.reporter_id);
        const resolverProf = r.resolved_by ? profileMap.get(r.resolved_by) : null;
        const ch = channelMap.get(r.channel_id);
        const modState = msg?.moderation_state || (msg?.deleted_at ? "deleted_admin" : "active");
        const readableText = msg?.deleted_at
          ? "[Message supprimé définitivement]"
          : msg?.content || msg?.archived_content || "";

        return {
          id: r.id,
          messageId: r.message_id,
          channelId: r.channel_id,
          channelName: ch?.name || "Communauté Winelio",
          reason: r.reason,
          details: r.details,
          status: r.status,
          createdAt: r.created_at,
          resolvedAt: r.resolved_at,
          resolvedByName: resolverProf
            ? formatMemberDisplayName(resolverProf.first_name, resolverProf.last_name)
            : null,
          resolutionNote: r.resolution_note ?? null,
          reporterName: formatMemberDisplayName(reporterProf?.first_name, reporterProf?.last_name),
          authorId: msg?.author_id ?? null,
          authorName: msg?.author_id
            ? formatMemberDisplayName(authorProf?.first_name, authorProf?.last_name)
            : "Membre supprimé",
          authorEmail: authorProf?.email ?? null,
          messageContent: readableText,
          hasAttachments: Array.isArray(msg?.attachments) && msg.attachments.length > 0,
          messageDeleted: Boolean(msg?.deleted_at),
          moderationState: modState,
        };
      }),
      restrictions: (restrictions ?? []).map((res) => {
        const prof = profileMap.get(res.user_id);
        const ch = res.channel_id ? channelMap.get(res.channel_id) : null;
        return {
          id: res.id,
          userId: res.user_id,
          userName: formatMemberDisplayName(prof?.first_name, prof?.last_name),
          userEmail: prof?.email ?? null,
          channelName: ch ? ch.name : "Tous les salons",
          restrictedUntil: res.restricted_until,
          reason: res.reason,
          createdAt: res.created_at,
        };
      }),
    });
  } catch (err) {
    console.error("[admin/messaging] GET error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getMessagingActor();
    if (!actor || !actor.isSuperAdmin) {
      return NextResponse.json({ error: "Accès réservé aux Super Admins" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?:
        | "sync_all"
        | "toggle_channel_photos"
        | "resolve_report"
        | "restrict_user"
        | "lift_restriction";
      channelId?: string;
      allowMemberPhotos?: boolean;
      reportId?: string;
      decision?: "dismiss" | "mask_message" | "delete_message";
      restrictDuration?: "none" | "24h" | "7d" | "permanent";
      userId?: string;
      restrictionId?: string;
      reason?: string;
    };

    if (body.action === "sync_all") {
      const { data: syncedCount, error } = await supabaseAdmin.rpc("sync_all_messaging_channels");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, syncedCount: syncedCount ?? 0 });
    }

    if (body.action === "toggle_channel_photos") {
      const channelId = String(body.channelId || "");
      if (!UUID_RE.test(channelId)) {
        return NextResponse.json({ error: "Salon invalide" }, { status: 400 });
      }
      const allow = Boolean(body.allowMemberPhotos);
      await supabaseAdmin
        .from("messaging_channels")
        .update({ allow_member_photos: allow, updated_at: new Date().toISOString() })
        .eq("id", channelId);

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.toggle_channel_photos",
        entityId: channelId,
        details: { allowMemberPhotos: allow },
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "resolve_report") {
      const reportId = String(body.reportId || "");
      if (!UUID_RE.test(reportId)) {
        return NextResponse.json({ error: "Signalement invalide" }, { status: 400 });
      }

      const { data: report } = await supabaseAdmin
        .from("messaging_reports")
        .select("id, message_id, channel_id")
        .eq("id", reportId)
        .maybeSingle();

      if (!report) {
        return NextResponse.json({ error: "Signalement introuvable" }, { status: 404 });
      }

      const { data: msg } = await supabaseAdmin
        .from("messaging_messages")
        .select("id, author_id, parent_message_id, content, archived_content, attachments, deleted_at, moderation_state")
        .eq("id", report.message_id)
        .maybeSingle();

      const nowIso = new Date().toISOString();

      if (body.decision === "mask_message" && msg && !msg.deleted_at) {
        await supabaseAdmin
          .from("messaging_messages")
          .update({
            moderation_state: "masked_admin",
            moderated_at: nowIso,
            moderated_by: actor.userId,
            moderation_reason:
              body.reason || "Contenu masqué suite à examen des Super Admins",
            archived_content: msg.archived_content ?? msg.content,
          })
          .eq("id", msg.id);

        await supabaseAdmin
          .from("messaging_pins")
          .delete()
          .eq("channel_id", report.channel_id)
          .eq("message_id", msg.id);

        await broadcastChannelUpdate(report.channel_id, {
          action: "message_masked",
          messageId: msg.id,
          parentMessageId: msg.parent_message_id,
        });
      } else if (body.decision === "delete_message" && msg && !msg.deleted_at) {
        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments as { key?: string }[]) {
            if (typeof att?.key === "string" && att.key.startsWith("messaging/")) {
              await deleteAvatar(att.key).catch(() => {});
            }
          }
        }
        await supabaseAdmin
          .from("messaging_messages")
          .update({
            deleted_at: nowIso,
            deleted_by: actor.userId,
            moderation_state: "deleted_admin",
            moderated_at: nowIso,
            moderated_by: actor.userId,
            moderation_reason:
              body.reason || "Message supprimé suite à examen des Super Admins",
            archived_content: null,
            title: null,
            content: "",
            attachments: [],
          })
          .eq("id", msg.id);

        await supabaseAdmin
          .from("messaging_pins")
          .delete()
          .eq("channel_id", report.channel_id)
          .eq("message_id", msg.id);

        await broadcastChannelUpdate(report.channel_id, {
          action: "message_deleted",
          messageId: msg.id,
          parentMessageId: msg.parent_message_id,
        });
      } else if (
        body.decision === "dismiss" &&
        msg &&
        !msg.deleted_at &&
        msg.moderation_state === "masked_admin"
      ) {
        await supabaseAdmin
          .from("messaging_messages")
          .update({
            moderation_state: "active",
            moderated_at: null,
            moderated_by: null,
            moderation_reason: null,
          })
          .eq("id", msg.id);

        await broadcastChannelUpdate(report.channel_id, {
          action: "message_restored",
          messageId: msg.id,
          parentMessageId: msg.parent_message_id,
        });
      }

      if (
        body.restrictDuration &&
        body.restrictDuration !== "none" &&
        msg?.author_id
      ) {
        const until =
          body.restrictDuration === "24h"
            ? new Date(Date.now() + 24 * 3600_000).toISOString()
            : body.restrictDuration === "7d"
            ? new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
            : "9999-12-31T23:59:59.000Z";

        await supabaseAdmin.from("messaging_restrictions").insert({
          user_id: msg.author_id,
          channel_id: null,
          restricted_until: until,
          reason: body.reason || "Modération suite à signalement",
          created_by: actor.userId,
        });
      }

      await supabaseAdmin
        .from("messaging_reports")
        .update({
          status: body.decision === "dismiss" ? "dismissed" : "resolved",
          resolved_by: actor.userId,
          resolved_at: nowIso,
          resolution_note: body.decision ?? null,
        })
        .eq("message_id", report.message_id);

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.resolve_report",
        entityId: reportId,
        details: { decision: body.decision, restrictDuration: body.restrictDuration },
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "restrict_user") {
      const userId = String(body.userId || "");
      if (!UUID_RE.test(userId)) {
        return NextResponse.json({ error: "Utilisateur invalide" }, { status: 400 });
      }
      const duration = body.restrictDuration || "24h";
      const until =
        duration === "24h"
          ? new Date(Date.now() + 24 * 3600_000).toISOString()
          : duration === "7d"
          ? new Date(Date.now() + 7 * 24 * 3600_000).toISOString()
          : "9999-12-31T23:59:59.000Z";

      await supabaseAdmin.from("messaging_restrictions").insert({
        user_id: userId,
        channel_id: body.channelId && UUID_RE.test(body.channelId) ? body.channelId : null,
        restricted_until: until,
        reason: body.reason ? String(body.reason).slice(0, 300) : "Mise en lecture seule admin",
        created_by: actor.userId,
      });

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.restrict_user",
        entityId: userId,
        details: { duration, until },
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "lift_restriction") {
      const restrictionId = String(body.restrictionId || "");
      if (!UUID_RE.test(restrictionId)) {
        return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
      }
      await supabaseAdmin
        .from("messaging_restrictions")
        .delete()
        .eq("id", restrictionId);

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.lift_restriction",
        entityId: restrictionId,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    console.error("[admin/messaging] POST error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
