/**
 * Le client `supabaseAdmin` est configuré avec SUPABASE_URL=http://supabase-kong:8000
 * (DNS interne Docker). Les URLs signées générées par createSignedUrl/getPublicUrl
 * conservent cet hôte interne — inutilisable depuis un email ou un navigateur.
 *
 * Ce helper réécrit l'hôte vers NEXT_PUBLIC_SUPABASE_URL (URL publique HTTPS).
 */
export function toPublicStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const publicBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!publicBase) return url;
  try {
    const parsed = new URL(url);
    const publicParsed = new URL(publicBase);
    parsed.protocol = publicParsed.protocol;
    // /!\ URL.host = "domaine" SANS port conserve le port d'origine.
    // Il faut écrire hostname + port séparément pour purger l'éventuel :8000
    // hérité de l'hôte interne supabase-kong:8000.
    parsed.hostname = publicParsed.hostname;
    parsed.port = publicParsed.port;
    return parsed.toString();
  } catch {
    return url;
  }
}
