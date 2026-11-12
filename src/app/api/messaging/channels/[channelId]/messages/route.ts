import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ALLOWED_EMOJIS,
  broadcastChannelUpdate,
  checkWriteFlood,
  formatMemberDisplayName,
  getChannelAccess,
  getMessagingActor,
  MAX_MESSAGE_LENGTH,
  MAX_TITLE_LENGTH,
  resolveAuthorBadge,
  sanitizeAuthorAvatar,
  type AllowedEmoji,
  type MessageType,
  type ModerationState,
} from "@/lib/messaging";
import { dispatchCommunityMessagePush } from "@/lib/push-notifications";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawAttachment = {
  key?: unknown;
  mime?: unknown;
  width?: unknown;
  height?: unknown;
};

type RawMessageRow = {
  id: string;
  channel_id: string;
  author_id: string | null;
  author_badge: string;
  message_type?: string | null;
  welcome_member_id?: string | null;
  parent_message_id: string | null;
  title: string | null;
  content: string;
  attachments: unknown;
  comments_enabled: boolean;
  reply_count: number;
  edited_at: string | null;
  deleted_at: string | null;
  moderation_state?: string | null;
  moderated_at?: string | null;
  moderation_reason?: string | null;
  archived_content?: string | null;
  created_at: string;
};

const MESSAGE_SELECT =
  "id, channel_id, author_id, author_badge, message_type, welcome_member_id, parent_message_id, title, content, attachments, comments_enabled, reply_count, edited_at, deleted_at, moderation_state, moderated_at, moderation_reason, archived_content, created_at";

function resolveModerationState(row: RawMessageRow): ModerationState {
  if (
    row.moderation_state === "masked_admin" ||
    row.moderation_state === "deleted_author" ||
    row.moderation_state === "deleted_admin"
  ) {
    return row.moderation_state;
  }
  if (row.deleted_at) {
    return "deleted_admin";
  }
  return "active";
}

async function enrichMessages(
  rows: RawMessageRow[],
  viewerId: string,
  viewerIsSuperAdmin: boolean,
  pinnedSet: Set<string>,
) {
  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const authorIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.author_id, r.welcome_member_id ?? null])
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const parentIds = Array.from(
    new Set(rows.map((r) => r.parent_message_id).filter((id): id is string => Boolean(id))),
  );

  const [{ data: profiles }, { data: reactions }, { data: parents }, { data: pendingReports }] =
    await Promise.all([
      authorIds.length > 0
        ? supabaseAdmin
            .from("profiles")
            .select("id, first_name, last_name, avatar, avatar_visible_to_network")
            .in("id", authorIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              first_name: string | null;
              last_name: string | null;
              avatar: string | null;
              avatar_visible_to_network: boolean | null;
            }[],
          }),
      supabaseAdmin
        .from("messaging_reactions")
        .select("message_id, user_id, emoji, created_at")
        .in("message_id", messageIds)
        .order("created_at", { ascending: false }),
      parentIds.length > 0
        ? supabaseAdmin
            .from("messaging_messages")
            .select("id, author_id, content, deleted_at, moderation_state")
            .in("id", parentIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              author_id: string | null;
              content: string;
              deleted_at: string | null;
              moderation_state?: string | null;
            }[],
          }),
      viewerIsSuperAdmin
        ? supabaseAdmin
            .from("messaging_reports")
            .select("message_id")
            .in("message_id", messageIds)
            .eq("status", "pending")
        : Promise.resolve({ data: [] as { message_id: string }[] }),
    ]);

  const extraProfileIds = Array.from(
    new Set(
      [
        ...(parents ?? []).map((p) => p.author_id),
        ...(reactions ?? []).map((r) => r.user_id),
      ].filter((id): id is string => Boolean(id)),
    ),
  ).filter((id) => !authorIds.includes(id));

  let extraParentProfiles: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar: string | null;
    avatar_visible_to_network: boolean | null;
  }[] = [];

  if (extraProfileIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, avatar, avatar_visible_to_network")
      .in("id", extraProfileIds);
    extraParentProfiles = data ?? [];
  }

  const profileMap = new Map(
    [...(profiles ?? []), ...extraParentProfiles].map((p) => [p.id, p]),
  );
  const parentMap = new Map((parents ?? []).map((p) => [p.id, p]));

  const pendingReportCountByMsg = new Map<string, number>();
  for (const rep of pendingReports ?? []) {
    pendingReportCountByMsg.set(
      rep.message_id,
      (pendingReportCountByMsg.get(rep.message_id) ?? 0) + 1,
    );
  }

  const reactionsByMsg = new Map<
    string,
    {
      byEmoji: Map<string, { count: number; reacted: boolean }>;
      myReaction: AllowedEmoji | null;
      total: number;
      otherUserIds: string[];
    }
  >();

  for (const r of reactions ?? []) {
    let bucket = reactionsByMsg.get(r.message_id);
    if (!bucket) {
      bucket = { byEmoji: new Map(), myReaction: null, total: 0, otherUserIds: [] };
      reactionsByMsg.set(r.message_id, bucket);
    }
    const prev = bucket.byEmoji.get(r.emoji) ?? { count: 0, reacted: false };
    prev.count += 1;
    bucket.total += 1;
    if (r.user_id === viewerId) {
      prev.reacted = true;
      if (ALLOWED_EMOJIS.includes(r.emoji as AllowedEmoji)) {
        bucket.myReaction = r.emoji as AllowedEmoji;
      }
    } else if (bucket.otherUserIds.length < 3 && !bucket.otherUserIds.includes(r.user_id)) {
      bucket.otherUserIds.push(r.user_id);
    }
    bucket.byEmoji.set(r.emoji, prev);
  }

  return rows.map((row) => {
    const moderationState = resolveModerationState(row);
    const isHidden = moderationState !== "active" || Boolean(row.deleted_at);
    const isWelcome = row.message_type === "welcome";
    const messageType: MessageType =
      row.message_type === "announcement"
        ? "announcement"
        : isWelcome
        ? "welcome"
        : "post";

    const subjectId = isWelcome ? row.welcome_member_id ?? null : row.author_id;
    const prof = subjectId ? profileMap.get(subjectId) : null;
    const reactionBucket = reactionsByMsg.get(row.id);

    const reactionSummary = isHidden
      ? []
      : ALLOWED_EMOJIS.map((emoji) => {
          const entry = reactionBucket?.byEmoji.get(emoji);
          return entry ? { emoji, count: entry.count, reacted: entry.reacted } : null;
        })
          .filter(
            (x): x is { emoji: AllowedEmoji; count: number; reacted: boolean } => Boolean(x),
          )
          .sort((a, b) => b.count - a.count);

    const safeAttachments =
      isHidden || !Array.isArray(row.attachments)
        ? []
        : (row.attachments as { key?: string; mime?: string; width?: number; height?: number }[])
            .filter((a) => typeof a?.key === "string" && a.key.startsWith("messaging/"))
            .map((a) => ({
              key: a.key as string,
              url: `/api/messaging/media/${a.key}`,
              mime: a.mime || "image/webp",
              width: typeof a.width === "number" ? a.width : undefined,
              height: typeof a.height === "number" ? a.height : undefined,
            }));

    const parentRow = row.parent_message_id ? parentMap.get(row.parent_message_id) : null;
    const parentProf = parentRow?.author_id ? profileMap.get(parentRow.author_id) : null;
    const parentHidden = Boolean(
      parentRow?.deleted_at ||
        (parentRow?.moderation_state && parentRow.moderation_state !== "active"),
    );

    return {
      id: row.id,
      channelId: row.channel_id,
      parentMessageId: row.parent_message_id,
      parentPreview: parentRow
        ? {
            id: parentRow.id,
            authorName: parentRow.author_id
              ? formatMemberDisplayName(parentProf?.first_name, parentProf?.last_name)
              : "Membre supprimé",
            excerpt: parentHidden
              ? "Message retiré ou masqué"
              : parentRow.content.slice(0, 120) || "📷 Photo",
          }
        : null,
      author: {
        id: subjectId,
        displayName: subjectId
          ? formatMemberDisplayName(prof?.first_name, prof?.last_name)
          : isWelcome
          ? "Communauté Winelio"
          : "Membre supprimé",
        avatar: subjectId
          ? sanitizeAuthorAvatar(prof?.avatar, prof?.avatar_visible_to_network)
          : null,
        badge: isWelcome
          ? "welcome"
          : messageType === "announcement"
          ? "admin"
          : row.author_badge,
      },
      messageType,
      isOwn: Boolean(row.author_id && row.author_id === viewerId),
      title: isHidden ? null : row.title,
      content: isHidden ? "" : row.content,
      attachments: safeAttachments,
      commentsEnabled: row.comments_enabled,
      replyCount: row.reply_count,
      isDeleted: isHidden,
      moderationState,
      moderatedAt: row.moderated_at ?? row.deleted_at ?? null,
      moderationReason: isHidden ? row.moderation_reason ?? null : null,
      archivedContent:
        viewerIsSuperAdmin && moderationState === "masked_admin"
          ? row.archived_content ?? row.content ?? null
          : undefined,
      pendingReportCount: viewerIsSuperAdmin
        ? pendingReportCountByMsg.get(row.id) ?? 0
        : undefined,
      isPinned: !isHidden && pinnedSet.has(row.id),
      editedAt: row.edited_at,
      createdAt: row.created_at,
      reactions: reactionSummary,
      myReaction: isHidden ? null : reactionBucket?.myReaction ?? null,
      totalReactions: isHidden ? 0 : reactionBucket?.total ?? 0,
      reactorPreview: isHidden
        ? []
        : [
            ...(reactionBucket?.myReaction ? ["Vous"] : []),
            ...(reactionBucket?.otherUserIds ?? []).map((uid) => {
              const rp = profileMap.get(uid);
              return formatMemberDisplayName(rp?.first_name, rp?.last_name);
            }),
          ].slice(0, 3),
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params;
    if (!UUID_RE.test(channelId)) {
      return NextResponse.json({ error: "Identifiant de salon invalide" }, { status: 400 });
    }

    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const access = await getChannelAccess(actor, channelId);
    if (!access) {
      return NextResponse.json({ error: "Accès refusé à ce salon" }, { status: 403 });
    }

    const parentId = req.nextUrl.searchParams.get("parentId");
    const before = req.nextUrl.searchParams.get("before");
    const filter = req.nextUrl.searchParams.get("filter");
    const markRead = req.nextUrl.searchParams.get("markRead") !== "0";
    const rawLimit = Number(req.nextUrl.searchParams.get("limit") || "40");
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 40, 1), 80);

    const { data: pinRows } = await supabaseAdmin
      .from("messaging_pins")
      .select("message_id, pinned_at")
      .eq("channel_id", channelId)
      .order("pinned_at", { ascending: false });

    const pinnedIds = (pinRows ?? []).map((p) => p.message_id as string);
    const pinnedSet = new Set(pinnedIds);

    // Mode 1 : Fil de commentaires / réponses groupées sous un message parent
    if (parentId) {
      if (!UUID_RE.test(parentId)) {
        return NextResponse.json({ error: "Message parent invalide" }, { status: 400 });
      }

      const [{ data: parentRow }, { data: replyRows }] = await Promise.all([
        supabaseAdmin
          .from("messaging_messages")
          .select(MESSAGE_SELECT)
          .eq("id", parentId)
          .eq("channel_id", channelId)
          .maybeSingle(),
        supabaseAdmin
          .from("messaging_messages")
          .select(MESSAGE_SELECT)
          .eq("channel_id", channelId)
          .eq("parent_message_id", parentId)
          .order("created_at", { ascending: true })
          .limit(100),
      ]);

      if (!parentRow) {
        return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
      }

      const [enrichedParent] = await enrichMessages(
        [parentRow as RawMessageRow],
        actor.userId,
        actor.isSuperAdmin,
        pinnedSet,
      );
      const enrichedReplies = await enrichMessages(
        (replyRows ?? []) as RawMessageRow[],
        actor.userId,
        actor.isSuperAdmin,
        pinnedSet,
      );

      return NextResponse.json({
        parent: enrichedParent,
        replies: enrichedReplies,
      });
    }

    // Mode 2 : Flux principal du salon (pagination par curseur)
    let feedQuery = supabaseAdmin
      .from("messaging_messages")
      .select(MESSAGE_SELECT)
      .eq("channel_id", channelId)
      .is("parent_message_id", null)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (filter === "official") {
      feedQuery = feedQuery.eq("message_type", "announcement");
    } else if (filter === "community") {
      feedQuery = feedQuery.eq("message_type", "post");
    } else if (filter === "welcome") {
      feedQuery = feedQuery.eq("message_type", "welcome");
    }

    if (before) {
      feedQuery = feedQuery.lt("created_at", before);
    }

    const { data: fetchedRows, error: feedErr } = await feedQuery;
    if (feedErr) {
      return NextResponse.json({ error: "Impossible de charger les messages" }, { status: 500 });
    }

    const allFetched = (fetchedRows ?? []) as RawMessageRow[];
    const hasMore = allFetched.length > limit;
    const slice = hasMore ? allFetched.slice(0, limit) : allFetched;

    const orderedRows =
      access.channel.kind === "announcements" ? slice : [...slice].reverse();

    const [enrichedMessages, enrichedPins] = await Promise.all([
      enrichMessages(orderedRows, actor.userId, actor.isSuperAdmin, pinnedSet),
      pinnedIds.length > 0 && !before
        ? supabaseAdmin
            .from("messaging_messages")
            .select(MESSAGE_SELECT)
            .eq("channel_id", channelId)
            .is("deleted_at", null)
            .eq("moderation_state", "active")
            .in("id", pinnedIds)
            .then(({ data }) =>
              enrichMessages(
                (data ?? []) as RawMessageRow[],
                actor.userId,
                actor.isSuperAdmin,
                pinnedSet,
              ),
            )
        : Promise.resolve([]),
    ]);

    if (!before && markRead) {
      await supabaseAdmin.from("messaging_memberships").upsert(
        {
          channel_id: channelId,
          user_id: actor.userId,
          role: access.role,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: "channel_id,user_id" },
      );
    }

    return NextResponse.json({
      messages: enrichedMessages,
      pins: enrichedPins,
      hasMore,
      nextCursor: hasMore ? slice[slice.length - 1]?.created_at ?? null : null,
    });
  } catch (err) {
    console.error("[messaging/messages] GET error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  try {
    const { channelId } = await params;
    if (!UUID_RE.test(channelId)) {
      return NextResponse.json({ error: "Salon invalide" }, { status: 400 });
    }

    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const access = await getChannelAccess(actor, channelId);
    if (!access) {
      return NextResponse.json({ error: "Accès refusé à ce salon" }, { status: 403 });
    }

    if (access.activeRestriction) {
      return NextResponse.json(
        {
          error: "Votre compte est actuellement en lecture seule sur la messagerie.",
          restrictedUntil: access.activeRestriction.until,
        },
        { status: 403 },
      );
    }

    if (!actor.isSuperAdmin) {
      const { data: pref } = await supabaseAdmin
        .from("messaging_preferences")
        .select("charter_accepted_at")
        .eq("user_id", actor.userId)
        .maybeSingle();

      if (!pref?.charter_accepted_at) {
        return NextResponse.json(
          { error: "Veuillez accepter la charte communautaire avant de publier." },
          { status: 403 },
        );
      }
    }

    if (!checkWriteFlood(actor.userId)) {
      return NextResponse.json(
        { error: "Envoi trop rapide. Patientez quelques secondes." },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      content?: string;
      title?: string | null;
      parentMessageId?: string | null;
      commentsEnabled?: boolean;
      isOfficialAnnouncement?: boolean;
      attachments?: RawAttachment[];
    };

    const content = String(body.content ?? "").trim();
    const rawTitle = body.title ? String(body.title).trim() : null;
    const rawParentId = body.parentMessageId ? String(body.parentMessageId).trim() : null;

    if (content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.` },
        { status: 400 },
      );
    }
    if (rawTitle && rawTitle.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        { error: `Le titre ne peut pas dépasser ${MAX_TITLE_LENGTH} caractères.` },
        { status: 400 },
      );
    }

    const rawAttachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 3) : [];
    const safePrefix = `messaging/${channelId}/`;
    const validAttachments: { key: string; mime: string; width?: number; height?: number }[] = [];

    for (const att of rawAttachments) {
      if (typeof att?.key !== "string" || !att.key.startsWith(safePrefix) || att.key.includes("..")) {
        return NextResponse.json({ error: "Pièce jointe invalide." }, { status: 400 });
      }
      if (!access.canUploadPhoto) {
        return NextResponse.json(
          { error: "Le partage de photos n'est pas autorisé pour votre rôle dans ce salon." },
          { status: 403 },
        );
      }
      validAttachments.push({
        key: att.key,
        mime: typeof att.mime === "string" ? att.mime : "image/webp",
        width: typeof att.width === "number" && att.width > 0 ? Math.round(att.width) : undefined,
        height:
          typeof att.height === "number" && att.height > 0 ? Math.round(att.height) : undefined,
      });
    }

    if (!content && validAttachments.length === 0) {
      return NextResponse.json(
        { error: "Veuillez saisir un message ou joindre une photo." },
        { status: 400 },
      );
    }

    let effectiveParentId: string | null = null;
    let parentAuthorId: string | null = null;

    if (rawParentId) {
      if (!UUID_RE.test(rawParentId)) {
        return NextResponse.json({ error: "Réponse invalide" }, { status: 400 });
      }

      const { data: parentMsg } = await supabaseAdmin
        .from("messaging_messages")
        .select("id, author_id, parent_message_id, comments_enabled, deleted_at, moderation_state")
        .eq("id", rawParentId)
        .eq("channel_id", channelId)
        .maybeSingle();

      if (
        !parentMsg ||
        parentMsg.deleted_at ||
        (parentMsg.moderation_state && parentMsg.moderation_state !== "active")
      ) {
        return NextResponse.json(
          { error: "Le message auquel vous répondez n'est plus disponible." },
          { status: 404 },
        );
      }

      effectiveParentId = parentMsg.parent_message_id ?? parentMsg.id;
      parentAuthorId = parentMsg.author_id ?? null;

      if (effectiveParentId !== parentMsg.id) {
        const { data: rootParent } = await supabaseAdmin
          .from("messaging_messages")
          .select("author_id, comments_enabled, deleted_at, moderation_state")
          .eq("id", effectiveParentId)
          .maybeSingle();
        if (
          !rootParent ||
          rootParent.deleted_at ||
          (rootParent.moderation_state && rootParent.moderation_state !== "active")
        ) {
          return NextResponse.json({ error: "Fil de discussion fermé." }, { status: 404 });
        }
        if (rootParent.comments_enabled === false && !actor.isSuperAdmin) {
          return NextResponse.json(
            { error: "Les commentaires sont désactivés sous cette publication." },
            { status: 403 },
          );
        }
        parentAuthorId = rootParent.author_id ?? parentAuthorId;
      } else if (parentMsg.comments_enabled === false && !actor.isSuperAdmin) {
        return NextResponse.json(
          { error: "Les commentaires sont désactivés sous cette publication." },
          { status: 403 },
        );
      }
    } else if (!access.canPostTopLevel) {
      return NextResponse.json({ error: "Publication non autorisée." }, { status: 403 });
    }

    const isOfficial =
      !effectiveParentId &&
      access.canPostOfficialAnnouncement &&
      body.isOfficialAnnouncement !== false;

    const badge = isOfficial
      ? "admin"
      : resolveAuthorBadge({
          isSuperAdmin: actor.isSuperAdmin,
          isFounder: actor.isFounder,
          channelRole: access.role,
          isProfessional: actor.isProfessional,
        });

    const insertPayload = {
      channel_id: channelId,
      author_id: actor.userId,
      author_badge: badge,
      message_type: (isOfficial ? "announcement" : "post") as MessageType,
      parent_message_id: effectiveParentId,
      title: !effectiveParentId && isOfficial ? rawTitle : null,
      content,
      attachments: validAttachments,
      comments_enabled:
        !effectiveParentId && isOfficial ? body.commentsEnabled !== false : true,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("messaging_messages")
      .insert(insertPayload)
      .select(MESSAGE_SELECT)
      .single();

    if (insertErr || !inserted) {
      console.error("[messaging/messages] insert error:", insertErr);
      return NextResponse.json({ error: "Impossible d'envoyer le message." }, { status: 500 });
    }

    const nowIso = inserted.created_at;

    if (effectiveParentId) {
      const { count: repliesCount } = await supabaseAdmin
        .from("messaging_messages")
        .select("id", { count: "exact", head: true })
        .eq("parent_message_id", effectiveParentId)
        .is("deleted_at", null)
        .eq("moderation_state", "active");

      await supabaseAdmin
        .from("messaging_messages")
        .update({ reply_count: repliesCount ?? 0 })
        .eq("id", effectiveParentId);
    }

    if (!effectiveParentId) {
      const previewSource = insertPayload.title || content || "📷 Photo partagée";
      await supabaseAdmin
        .from("messaging_channels")
        .update({
          last_message_at: nowIso,
          last_message_preview: previewSource.slice(0, 110),
          updated_at: nowIso,
        })
        .eq("id", channelId);
    }

    await supabaseAdmin.from("messaging_memberships").upsert(
      {
        channel_id: channelId,
        user_id: actor.userId,
        role: access.role,
        last_read_at: nowIso,
      },
      { onConflict: "channel_id,user_id" },
    );

    const [enriched] = await enrichMessages(
      [inserted as RawMessageRow],
      actor.userId,
      actor.isSuperAdmin,
      new Set(),
    );

    await broadcastChannelUpdate(channelId, {
      action: "message_created",
      messageId: inserted.id,
      parentMessageId: effectiveParentId,
    });

    void dispatchCommunityMessagePush({
      channelId,
      messageId: inserted.id,
      authorId: actor.userId,
      authorDisplayName: enriched?.author.displayName || "Membre Winelio",
      messageType: insertPayload.message_type,
      title: insertPayload.title,
      content,
      hasPhoto: validAttachments.length > 0,
      parentMessageId: effectiveParentId,
      parentAuthorId,
    }).catch((err) => {
      console.error("[messaging/messages] push dispatch warning:", err);
    });

    return NextResponse.json({ success: true, message: enriched }, { status: 201 });
  } catch (err) {
    console.error("[messaging/messages] POST error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
