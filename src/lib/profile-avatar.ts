import { SUPABASE_URL } from "@/lib/supabase/config";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";

export function resolveProfileAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (/^https?:\/\//i.test(avatar)) return avatar;

  const cleanPath = avatar.replace(/^\/+/, "");
  if (!cleanPath) return null;

  return `${SUPABASE_URL}/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/${cleanPath}`;
}

export function extractProfileAvatarPath(avatar: string | null | undefined): string | null {
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

export function getProfileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
