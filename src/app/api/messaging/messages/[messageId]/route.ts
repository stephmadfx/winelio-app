import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteAvatar } from "@/lib/r2-avatars";
import {
  ALLOWED_EMOJIS,
  broadcastChannelUpdate,
  EDIT_WINDOW_MS,
  getChannelAccess,
  getMessagingActor,
  logMessagingAudit,
  MAX_MESSAGE_LENGTH,
  MAX_PINS_PER_CHANNEL,
  MAX_TITLE_LENGTH,
  REPORT_REASONS,
  type AllowedEmoji,
  type ModerationState,
  type ReportReason,
} from "@/lib/messaging";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function refreshParentReplyCount(parentMessageId: string | null) {
  if (!parentMessageId) return;
  const { count } = await supabaseAdmin
    .from("messaging_messages")
    .select("id", { count: "exact", head: true })
    .eq("parent_message_id", parentMessageId)
    .is("deleted_at", null)
    .eq("moderation_state", "active");

  await supabaseAdmin
    .from("messaging_messages")
    .update({ reply_count: count ?? 0 })
    .eq("id", parentMessageId);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    if (!UUID_RE.test(messageId)) {
      return NextResponse.json({ error: "Message invalide" }, { status: 400 });
    }

    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: msg } = await supabaseAdmin
      .from("messaging_messages")
      .select(
        "id, channel_id, author_id, parent_message_id, message_type, title, content, comments_enabled, deleted_at, moderation_state, archived_content, created_at",
      )
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) {
      return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
    }

    const access = await getChannelAccess(actor, msg.channel_id);
    if (!access) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?:
        | "edit"
        | "toggle_reaction"
        | "toggle_pin"
        | "toggle_comments"
        | "report"
        | "mask"
        | "restore";
      content?: string;
      title?: string | null;
      emoji?: string;
      reason?: string;
      details?: string;
    };

    const currentModState = (msg.moderation_state || "active") as ModerationState;
    const isHidden = Boolean(msg.deleted_at) || currentModState !== "active";

    // 1. Réaction style Facebook / Messenger : 1 seule réaction par utilisateur et par message
    if (body.action === "toggle_reaction") {
      if (isHidden) {
        return NextResponse.json({ error: "Message indisponible" }, { status: 400 });
      }
      if (access.activeRestriction) {
        return NextResponse.json({ error: "Compte en lecture seule" }, { status: 403 });
      }
      const emoji = String(body.emoji || "") as AllowedEmoji;
      if (!ALLOWED_EMOJIS.includes(emoji)) {
        return NextResponse.json({ error: "Emoji non pris en charge" }, { status: 400 });
      }

      const { data: existing } = await supabaseAdmin
        .from("messaging_reactions")
        .select("emoji")
        .eq("message_id", messageId)
        .eq("user_id", actor.userId)
        .maybeSingle();

      let myReaction: AllowedEmoji | null = null;

      if (existing?.emoji === emoji) {
        await supabaseAdmin
          .from("messaging_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", actor.userId);
        myReaction = null;
      } else {
        await supabaseAdmin.from("messaging_reactions").upsert(
          {
            message_id: messageId,
            user_id: actor.userId,
            emoji,
            created_at: new Date().toISOString(),
          },
          { onConflict: "message_id,user_id" },
        );
        myReaction = emoji;
      }

      await broadcastChannelUpdate(msg.channel_id, {
        action: "reaction_toggled",
        messageId,
        parentMessageId: msg.parent_message_id,
      });

      return NextResponse.json({
        success: true,
        reacted: Boolean(myReaction),
        myReaction,
      });
    }

    // 2. Édition d'un message (15 min pour l'auteur, illimitée pour super_admin)
    if (body.action === "edit") {
      if (isHidden) {
        return NextResponse.json({ error: "Message indisponible" }, { status: 400 });
      }
      const isAuthor = msg.author_id === actor.userId;
      if (!isAuthor && !actor.isSuperAdmin) {
        return NextResponse.json({ error: "Modification non autorisée" }, { status: 403 });
      }
      if (!actor.isSuperAdmin) {
        const ageMs = Date.now() - new Date(msg.created_at).getTime();
        if (ageMs > EDIT_WINDOW_MS) {
          return NextResponse.json(
            { error: "Le délai de modification (15 minutes) est dépassé." },
            { status: 403 },
          );
        }
      }

      const nextContent = String(body.content ?? "").trim();
      if (!nextContent || nextContent.length > MAX_MESSAGE_LENGTH) {
        return NextResponse.json(
          { error: `Le message doit contenir entre 1 et ${MAX_MESSAGE_LENGTH} caractères.` },
          { status: 400 },
        );
      }

      const updateFields: Record<string, unknown> = {
        content: nextContent,
        edited_at: new Date().toISOString(),
      };

      if (body.title !== undefined && msg.message_type === "announcement" && !msg.parent_message_id) {
        const nextTitle = body.title ? String(body.title).trim() : null;
        if (nextTitle && nextTitle.length > MAX_TITLE_LENGTH) {
          return NextResponse.json({ error: "Titre trop long" }, { status: 400 });
        }
        updateFields.title = nextTitle;
      }

      await supabaseAdmin.from("messaging_messages").update(updateFields).eq("id", messageId);

      await broadcastChannelUpdate(msg.channel_id, {
        action: "message_edited",
        messageId,
        parentMessageId: msg.parent_message_id,
      });

      return NextResponse.json({ success: true });
    }

    // 3. Masquer un message non conforme avec trace visible (Super Admin / Modérateur)
    if (body.action === "mask") {
      if (!access.canModerate) {
        return NextResponse.json({ error: "Réservé à la modération" }, { status: 403 });
      }
      if (msg.deleted_at) {
        return NextResponse.json({ error: "Ce message est déjà supprimé." }, { status: 400 });
      }

      const reason = body.reason
        ? String(body.reason).trim().slice(0, 300)
        : "Contenu masqué suite à non-conformité avec la charte Winelio";

      const nowIso = new Date().toISOString();
      await Promise.all([
        supabaseAdmin
          .from("messaging_messages")
          .update({
            moderation_state: "masked_admin",
            moderated_at: nowIso,
            moderated_by: actor.userId,
            moderation_reason: reason,
            archived_content: msg.archived_content ?? msg.content,
          })
          .eq("id", messageId),
        supabaseAdmin
          .from("messaging_pins")
          .delete()
          .eq("channel_id", msg.channel_id)
          .eq("message_id", messageId),
      ]);

      await refreshParentReplyCount(msg.parent_message_id);

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.mask_message",
        entityId: messageId,
        details: { channelId: msg.channel_id, originalAuthorId: msg.author_id, reason },
      });

      await broadcastChannelUpdate(msg.channel_id, {
        action: "message_masked",
        messageId,
        parentMessageId: msg.parent_message_id,
      });

      return NextResponse.json({ success: true, moderationState: "masked_admin" });
    }

    // 4. Restaurer un message masqué après examen des Super Admins
    if (body.action === "restore") {
      if (!actor.isSuperAdmin) {
        return NextResponse.json({ error: "Réservé aux Super Admins" }, { status: 403 });
      }
      if (msg.deleted_at || currentModState !== "masked_admin") {
        return NextResponse.json({ error: "Ce message ne peut pas être restauré." }, { status: 400 });
      }

      await supabaseAdmin
        .from("messaging_messages")
        .update({
          moderation_state: "active",
          moderated_at: null,
          moderated_by: null,
          moderation_reason: null,
        })
        .eq("id", messageId);

      await refreshParentReplyCount(msg.parent_message_id);

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.restore_message",
        entityId: messageId,
        details: { channelId: msg.channel_id },
      });

      await broadcastChannelUpdate(msg.channel_id, {
        action: "message_restored",
        messageId,
        parentMessageId: msg.parent_message_id,
      });

      return NextResponse.json({ success: true, moderationState: "active" });
    }

    // 5. Épingler / désépingler un message important (max 3)
    if (body.action === "toggle_pin") {
      if (!access.canPin) {
        return NextResponse.json(
          { error: "Seuls les administrateurs peuvent épingler un message." },
          { status: 403 },
        );
      }
      if (isHidden || msg.parent_message_id) {
        return NextResponse.json(
          { error: "Seuls les messages principaux actifs peuvent être épinglés." },
          { status: 400 },
        );
      }

      const { data: existingPin } = await supabaseAdmin
        .from("messaging_pins")
        .select("message_id")
        .eq("channel_id", msg.channel_id)
        .eq("message_id", messageId)
        .maybeSingle();

      let pinned = false;
      if (existingPin) {
        await supabaseAdmin
          .from("messaging_pins")
          .delete()
          .eq("channel_id", msg.channel_id)
          .eq("message_id", messageId);
      } else {
        const { count } = await supabaseAdmin
          .from("messaging_pins")
          .select("message_id", { count: "exact", head: true })
          .eq("channel_id", msg.channel_id);

        if ((count ?? 0) >= MAX_PINS_PER_CHANNEL) {
          return NextResponse.json(
            {
              error: `Maximum ${MAX_PINS_PER_CHANNEL} messages épinglés. Désépinglez-en un d'abord.`,
            },
            { status: 400 },
          );
        }

        await supabaseAdmin.from("messaging_pins").insert({
          channel_id: msg.channel_id,
          message_id: messageId,
          pinned_by: actor.userId,
        });
        pinned = true;
      }

      await logMessagingAudit({
        userId: actor.userId,
        action: pinned ? "messaging.pin_message" : "messaging.unpin_message",
        entityId: messageId,
        details: { channelId: msg.channel_id },
      });

      await broadcastChannelUpdate(msg.channel_id, {
        action: "pin_toggled",
        messageId,
        pinned,
      });

      return NextResponse.json({ success: true, pinned });
    }

    // 6. Ouvrir / fermer les commentaires sous une publication
    if (body.action === "toggle_comments") {
      if (!actor.isSuperAdmin) {
        return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
      }
      const nextEnabled = !msg.comments_enabled;
      await supabaseAdmin
        .from("messaging_messages")
        .update({ comments_enabled: nextEnabled })
        .eq("id", messageId);

      await broadcastChannelUpdate(msg.channel_id, {
        action: "comments_toggled",
        messageId,
        commentsEnabled: nextEnabled,
      });

      return NextResponse.json({ success: true, commentsEnabled: nextEnabled });
    }

    // 7. Signalement d'un message non conforme (ouvert aux membres ET aux Super Admins, étudié par les 3 Super Admins)
    if (body.action === "report") {
      if (isHidden) {
        return NextResponse.json({ error: "Ce message a déjà été retiré ou masqué." }, { status: 400 });
      }
      if (msg.author_id && msg.author_id === actor.userId) {
        return NextResponse.json(
          { error: "Vous ne pouvez pas signaler votre propre message (vous pouvez le supprimer)." },
          { status: 400 },
        );
      }
      const reason = String(body.reason || "") as ReportReason;
      if (!REPORT_REASONS.includes(reason)) {
        return NextResponse.json({ error: "Motif de signalement invalide" }, { status: 400 });
      }
      const details = body.details ? String(body.details).trim().slice(0, 500) : null;

      const { error } = await supabaseAdmin.from("messaging_reports").upsert(
        {
          message_id: messageId,
          channel_id: msg.channel_id,
          reporter_id: actor.userId,
          reason,
          details,
          status: "pending",
          resolved_by: null,
          resolved_at: null,
          resolution_note: null,
        },
        { onConflict: "message_id,reporter_id" },
      );

      if (error) {
        return NextResponse.json({ error: "Signalement impossible" }, { status: 500 });
      }

      await logMessagingAudit({
        userId: actor.userId,
        action: "messaging.report_message",
        entityId: messageId,
        details: { channelId: msg.channel_id, reason, reportedBySuperAdmin: actor.isSuperAdmin },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (err) {
    console.error("[messaging/messages/id] PATCH error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await params;
    if (!UUID_RE.test(messageId)) {
      return NextResponse.json({ error: "Message invalide" }, { status: 400 });
    }

    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: msg } = await supabaseAdmin
      .from("messaging_messages")
      .select("id, channel_id, author_id, parent_message_id, attachments, deleted_at")
      .eq("id", messageId)
      .maybeSingle();

    if (!msg) {
      return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
    }
    if (msg.deleted_at) {
      return NextResponse.json({ success: true });
    }

    const access = await getChannelAccess(actor, msg.channel_id);
    if (!access) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const isAuthor = Boolean(msg.author_id && msg.author_id === actor.userId);
    if (!isAuthor && !access.canModerate) {
      return NextResponse.json({ error: "Suppression non autorisée" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { reason?: string };

    // Purger immédiatement les éventuelles photos privées sur R2
    if (Array.isArray(msg.attachments)) {
      for (const att of msg.attachments as { key?: string }[]) {
        if (typeof att?.key === "string" && att.key.startsWith("messaging/")) {
          await deleteAvatar(att.key).catch((e) =>
            console.error("[messaging] R2 cleanup warning:", e),
          );
        }
      }
    }

    const nowIso = new Date().toISOString();
    const moderationState: ModerationState = isAuthor ? "deleted_author" : "deleted_admin";
    const moderationReason = isAuthor
      ? null
      : body.reason
      ? String(body.reason).trim().slice(0, 300)
      : "Message supprimé par la modération Winelio";

    await Promise.all([
      supabaseAdmin
        .from("messaging_messages")
        .update({
          deleted_at: nowIso,
          deleted_by: actor.userId,
          moderation_state: moderationState,
          moderated_at: nowIso,
          moderated_by: actor.userId,
          moderation_reason: moderationReason,
          archived_content: null,
          title: null,
          content: "",
          attachments: [],
        })
        .eq("id", messageId),
      supabaseAdmin
        .from("messaging_pins")
        .delete()
        .eq("channel_id", msg.channel_id)
        .eq("message_id", messageId),
    ]);

    await refreshParentReplyCount(msg.parent_message_id);

    await logMessagingAudit({
      userId: actor.userId,
      action: isAuthor ? "messaging.author_delete" : "messaging.moderate_delete",
      entityId: messageId,
      details: {
        channelId: msg.channel_id,
        originalAuthorId: msg.author_id,
        moderationState,
      },
    });

    await broadcastChannelUpdate(msg.channel_id, {
      action: "message_deleted",
      messageId,
      parentMessageId: msg.parent_message_id,
    });

    return NextResponse.json({ success: true, moderationState });
  } catch (err) {
    console.error("[messaging/messages/id] DELETE error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
