import { SUPABASE_URL } from "@/lib/supabase/config";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";

export function resolveProfileAvatarUrl(avatar: string | null | undefined) {
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  const base = SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${avatar.replace(/^\/+/, "")}`;
}

export function extractProfileAvatarPath(avatar: string | null | undefined) {
  if (!avatar) return null;
  if (!/^https?:\/\//i.test(avatar)) return avatar.replace(/^\/+/, "");

  try {
    const url = new URL(avatar);
    const marker = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) {
      return url.pathname.slice(idx + marker.length).replace(/^\/+/, "");
    }
  } catch {
    return null;
  }

  return null;
}
