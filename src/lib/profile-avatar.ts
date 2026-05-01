// Les photos de profil sont stockées dans le bucket R2 PRIVÉ `winelio-avatars`.
// Lecture exclusivement via la route applicative `/api/avatars/<path>` qui vérifie
// le droit d'accès (owner / sponsor direct / super_admin) et redirige vers une
// signed URL R2 à TTL court.

export function resolveProfileAvatarUrl(avatar: string | null | undefined): string | null {
  if (!avatar) return null;

  // Compatibilité : si le champ contient déjà une URL absolue, on la respecte.
  if (/^https?:\/\//i.test(avatar)) return avatar;

  const cleanPath = avatar.replace(/^\/+/, "");
  if (!cleanPath) return null;

  return `/api/avatars/${cleanPath}`;
}

export function getProfileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
