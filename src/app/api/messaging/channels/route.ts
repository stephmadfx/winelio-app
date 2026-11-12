import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getMessagingActor,
  MESSAGING_GROUPS_ENABLED,
  TEAM_MIN_REFERRALS,
  type ChannelKind,
  type MembershipRole,
} from "@/lib/messaging";

const KIND_ORDER: Record<ChannelKind, number> = {
  announcements: 0,
  lineage: 1,
  team: 2,
};

export async function GET(req: NextRequest) {
  try {
    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (!actor.eligible) {
      return NextResponse.json({
        eligible: false,
        unreadCount: 0,
        channels: [],
        preferences: null,
        ownReferralCount: 0,
        teamMinReferrals: TEAM_MIN_REFERRALS,
      });
    }

    await supabaseAdmin.rpc("sync_user_messaging_channels", {
      p_user_id: actor.userId,
    });

    const summaryOnly = req.nextUrl.searchParams.get("summary") === "1";

    const [{ data: prefRow }, { data: userMemberships }] = await Promise.all([
      supabaseAdmin
        .from("messaging_preferences")
        .select("in_app_badges, email_major_announcements, charter_accepted_at")
        .eq("user_id", actor.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("messaging_memberships")
        .select("channel_id, role, last_read_at, muted_until")
        .eq("user_id", actor.userId),
    ]);

    const preferences = {
      inAppBadges: prefRow?.in_app_badges ?? true,
      emailMajorAnnouncements: prefRow?.email_major_announcements ?? true,
      charterAcceptedAt: prefRow?.charter_accepted_at ?? null,
    };

    const membershipMap = new Map(
      (userMemberships ?? []).map((m) => [m.channel_id as string, m]),
    );

    let channelsQuery = supabaseAdmin
      .from("messaging_channels")
      .select(
        "id, kind, slug, name, description, owner_id, allow_member_photos, last_message_at, last_message_preview, created_at",
      )
      .eq("is_archived", false);

    if (!MESSAGING_GROUPS_ENABLED) {
      channelsQuery = channelsQuery.eq("kind", "announcements");
    }

    if (!actor.isSuperAdmin) {
      const ids = Array.from(membershipMap.keys());
      if (ids.length === 0) {
        return NextResponse.json({
          eligible: true,
          unreadCount: 0,
          channels: [],
          preferences,
          ownReferralCount: 0,
          teamMinReferrals: TEAM_MIN_REFERRALS,
        });
      }
      channelsQuery = channelsQuery.in("id", ids);
    }

    const { data: rawChannels } = await channelsQuery;
    const channelsList = rawChannels ?? [];
    const nowMs = Date.now();

    let unreadCount = 0;
    for (const ch of channelsList) {
      const m = membershipMap.get(ch.id);
      const isMuted = Boolean(m?.muted_until && new Date(m.muted_until).getTime() > nowMs);
      const hasUnread = Boolean(
        ch.last_message_at &&
          (!m?.last_read_at || new Date(ch.last_message_at) > new Date(m.last_read_at)),
      );
      if (hasUnread && !isMuted && preferences.inAppBadges) {
        unreadCount += 1;
      }
    }

    if (summaryOnly) {
      return NextResponse.json({
        eligible: true,
        currentUserId: actor.userId,
        unreadCount,
        inAppBadges: preferences.inAppBadges,
      });
    }

    const channelIds = channelsList.map((c) => c.id);
    const [
      { data: allMemberships },
      { count: ownN1Count },
      { data: restrictions },
      { count: pendingReportCount },
    ] = await Promise.all([
      channelIds.length > 0
        ? supabaseAdmin
            .from("messaging_memberships")
            .select("channel_id")
            .in("channel_id", channelIds)
        : Promise.resolve({ data: [] as { channel_id: string }[] }),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("sponsor_id", actor.userId)
        .eq("is_active", true)
        .neq("is_demo", true),
      supabaseAdmin
        .from("messaging_restrictions")
        .select("channel_id, restricted_until, reason")
        .eq("user_id", actor.userId)
        .gt("restricted_until", new Date().toISOString()),
      actor.isSuperAdmin
        ? supabaseAdmin
            .from("messaging_reports")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
        : Promise.resolve({ count: 0 }),
    ]);

    const countByChannel = new Map<string, number>();
    for (const row of allMemberships ?? []) {
      countByChannel.set(row.channel_id, (countByChannel.get(row.channel_id) ?? 0) + 1);
    }

    const formattedChannels = channelsList
      .map((ch) => {
        const m = membershipMap.get(ch.id);
        const role: MembershipRole = (m?.role as MembershipRole | undefined) ?? "member";
        const canModerate = actor.isSuperAdmin || role === "owner" || role === "moderator";
        const isMuted = Boolean(m?.muted_until && new Date(m.muted_until).getTime() > nowMs);
        const hasUnread = Boolean(
          ch.last_message_at &&
            (!m?.last_read_at || new Date(ch.last_message_at) > new Date(m.last_read_at)),
        );
        const restriction = actor.isSuperAdmin
          ? null
          : (restrictions ?? []).find((r) => r.channel_id === null || r.channel_id === ch.id) ??
            null;

        return {
          id: ch.id,
          kind: ch.kind as ChannelKind,
          slug: ch.slug,
          name: ch.name,
          description: ch.description,
          ownerId: ch.owner_id,
          isMemberChannel: membershipMap.has(ch.id),
          role,
          memberCount: countByChannel.get(ch.id) ?? 0,
          allowMemberPhotos: Boolean(ch.allow_member_photos),
          canPostTopLevel: true,
          canPostOfficialAnnouncement: actor.isSuperAdmin,
          canModerate,
          canPin: canModerate,
          canUploadPhoto: canModerate || Boolean(ch.allow_member_photos),
          lastMessageAt: ch.last_message_at,
          lastMessagePreview: ch.last_message_preview,
          lastReadAt: m?.last_read_at ?? null,
          mutedUntil: m?.muted_until ?? null,
          isMuted,
          hasUnread,
          activeRestriction: restriction
            ? { until: restriction.restricted_until, reason: restriction.reason }
            : null,
        };
      })
      .sort((a, b) => {
        const kDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
        if (kDiff !== 0) return kDiff;
        if (a.isMemberChannel !== b.isMemberChannel) return a.isMemberChannel ? -1 : 1;
        return a.name.localeCompare(b.name, "fr");
      });

    return NextResponse.json({
      eligible: true,
      groupsEnabled: MESSAGING_GROUPS_ENABLED,
      currentUserId: actor.userId,
      isSuperAdmin: actor.isSuperAdmin,
      pendingReportCount: actor.isSuperAdmin ? pendingReportCount ?? 0 : 0,
      unreadCount,
      channels: formattedChannels,
      preferences,
      ownReferralCount: MESSAGING_GROUPS_ENABLED ? ownN1Count ?? 0 : 0,
      teamMinReferrals: TEAM_MIN_REFERRALS,
    });
  } catch (err) {
    console.error("[messaging/channels] GET error:", err);
    return NextResponse.json({ error: "Impossible de charger la messagerie." }, { status: 500 });
  }
}
