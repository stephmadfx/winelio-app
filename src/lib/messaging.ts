import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const PRIMARY_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🔥"] as const;
export const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "👏", "🔥", "🎉", "💡"] as const;
export type AllowedEmoji = (typeof ALLOWED_EMOJIS)[number];

export const REPORT_REASONS = [
  "non_compliant",
  "spam",
  "inappropriate",
  "personal_data",
  "misleading",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ModerationState = "active" | "masked_admin" | "deleted_author" | "deleted_admin";
export type MessageType = "announcement" | "post" | "welcome";

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 140;
export const MAX_PINS_PER_CHANNEL = 3;
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const TEAM_MIN_REFERRALS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// ponytail: salons par lignée et par équipe en stand-by non visible — passer à true pour les ouvrir
export const MESSAGING_GROUPS_ENABLED = false;

export type AuthorBadge = "admin" | "founder" | "leader" | "pro" | "member" | "welcome";
export type ChannelKind = "announcements" | "lineage" | "team";
export type MembershipRole = "member" | "moderator" | "owner";

export interface MessagingActor {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  isFounder: boolean;
  isProfessional: boolean;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  avatarVisibleToNetwork: boolean;
  eligible: boolean;
}

export interface ChannelAccess {
  channel: {
    id: string;
    kind: ChannelKind;
    slug: string;
    name: string;
    description: string | null;
    owner_id: string | null;
    allow_member_photos: boolean;
    is_archived: boolean;
  };
  role: MembershipRole;
  mutedUntil: string | null;
  lastReadAt: string | null;
  canPostTopLevel: boolean;
  canPostOfficialAnnouncement: boolean;
  canModerate: boolean;
  canPin: boolean;
  canUploadPhoto: boolean;
  activeRestriction: { until: string; reason: string | null } | null;
}

const EXCLUDED_EMAIL_RE = /@(winelio-demo\.internal|winelio-scraped\.local|winelio-e2e\.local|mailsac\.com)$/i;
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// ponytail: compteur anti-flood en mémoire par process (12 écritures / 30s / user), migrer vers Redis au-delà de 2500 membres simultanés
const writeFloodMap = new Map<string, { count: number; resetAt: number }>();

export function checkWriteFlood(userId: string, maxWrites = 12, windowMs = 30_000): boolean {
  const now = Date.now();
  const bucket = writeFloodMap.get(userId);
  if (!bucket || now > bucket.resetAt) {
    writeFloodMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= maxWrites;
}

export function formatMemberDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const first = firstName?.trim() || "Membre";
  const lastInitial = lastName?.trim() ? ` ${lastName.trim().charAt(0).toUpperCase()}.` : "";
  return `${first}${lastInitial}`;
}

export function sanitizeAuthorAvatar(
  avatar?: string | null,
  avatarVisibleToNetwork?: boolean | null,
): string | null {
  if (avatarVisibleToNetwork === false) return null;
  return avatar?.trim() || null;
}

export function resolveAuthorBadge(params: {
  isSuperAdmin?: boolean;
  isFounder?: boolean;
  channelRole?: MembershipRole | null;
  isProfessional?: boolean;
}): AuthorBadge {
  if (params.isSuperAdmin) return "admin";
  if (params.isFounder) return "founder";
  if (params.channelRole === "owner") return "leader";
  if (params.isProfessional) return "pro";
  return "member";
}

export async function getMessagingActor(): Promise<MessagingActor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isSuperAdmin = user.app_metadata?.role === "super_admin";

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, email, first_name, last_name, avatar, avatar_visible_to_network, is_founder, is_professional, is_active, is_demo",
    )
    .eq("id", user.id)
    .maybeSingle();

  const email = profile?.email || user.email || "";
  const eligible =
    isSuperAdmin ||
    Boolean(
      profile &&
        profile.is_active === true &&
        profile.is_demo !== true &&
        profile.id !== SYSTEM_USER_ID &&
        !EXCLUDED_EMAIL_RE.test(email),
    );

  return {
    userId: user.id,
    email,
    isSuperAdmin,
    isFounder: Boolean(profile?.is_founder),
    isProfessional: Boolean(profile?.is_professional),
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    avatar: profile?.avatar ?? null,
    avatarVisibleToNetwork: profile?.avatar_visible_to_network !== false,
    eligible,
  };
}

export async function getChannelAccess(
  actor: MessagingActor,
  channelId: string,
): Promise<ChannelAccess | null> {
  if (!actor.eligible) return null;

  const [{ data: channel }, { data: membership }, { data: restrictions }] = await Promise.all([
    supabaseAdmin
      .from("messaging_channels")
      .select("id, kind, slug, name, description, owner_id, allow_member_photos, is_archived")
      .eq("id", channelId)
      .maybeSingle(),
    supabaseAdmin
      .from("messaging_memberships")
      .select("role, muted_until, last_read_at")
      .eq("channel_id", channelId)
      .eq("user_id", actor.userId)
      .maybeSingle(),
    supabaseAdmin
      .from("messaging_restrictions")
      .select("restricted_until, reason, channel_id")
      .eq("user_id", actor.userId)
      .gt("restricted_until", new Date().toISOString())
      .order("restricted_until", { ascending: false }),
  ]);

  if (!channel || channel.is_archived) return null;
  if (!MESSAGING_GROUPS_ENABLED && channel.kind !== "announcements") return null;
  if (!actor.isSuperAdmin && !membership) return null;

  const role: MembershipRole = (membership?.role as MembershipRole | undefined) ?? "member";
  const canModerate = actor.isSuperAdmin || role === "owner" || role === "moderator";
  const canPostTopLevel = true;
  const canPostOfficialAnnouncement = actor.isSuperAdmin;
  const canUploadPhoto = canModerate || Boolean(channel.allow_member_photos);

  const matchingRestriction = actor.isSuperAdmin
    ? null
    : (restrictions ?? []).find((r) => r.channel_id === null || r.channel_id === channelId) ?? null;

  return {
    channel: channel as ChannelAccess["channel"],
    role,
    mutedUntil: membership?.muted_until ?? null,
    lastReadAt: membership?.last_read_at ?? null,
    canPostTopLevel,
    canPostOfficialAnnouncement,
    canModerate,
    canPin: canModerate,
    canUploadPhoto,
    activeRestriction: matchingRestriction
      ? { until: matchingRestriction.restricted_until, reason: matchingRestriction.reason }
      : null,
  };
}

export function detectSafeImageMime(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  // GIF: GIF87a / GIF89a
  const gifSig = buf.subarray(0, 6).toString("ascii");
  if (gifSig === "GIF87a" || gifSig === "GIF89a") {
    return { mime: "image/gif", ext: "gif" };
  }
  return null;
}

export async function broadcastChannelUpdate(
  channelId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseAdmin.rpc("broadcast_messaging_event", {
      p_channel_id: channelId,
      p_event: "messaging_update",
      p_payload: payload,
    });
  } catch (err) {
    console.error("[messaging] broadcast warning:", err);
  }
}

export async function logMessagingAudit(params: {
  userId: string;
  action: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: params.userId,
      action: params.action,
      entity_type: "messaging",
      entity_id: params.entityId ?? null,
      new_value: params.details ?? null,
      success: true,
    });
  } catch (err) {
    console.error("[messaging] audit log warning:", err);
  }
}
