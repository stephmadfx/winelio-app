import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAvatarSignedUrl } from "@/lib/r2-avatars";

// Route auth-protégée qui sert les photos de profil depuis R2 privé.
// Règles d'accès :
//   - Owner : oui (sa propre photo).
//   - Sponsor direct (niveau 1) : oui (relation MLM contractuelle).
//   - Super admin : oui (gestion).
//   - Membre du même réseau MLM (niveaux 2-5) : non, on retombe sur les initiales.
//   - Anonyme : 401.
//
// Réponse : redirect 302 vers la signed URL R2 (expire 1 h, cacheable côté client).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");
  if (!key) return NextResponse.json({ error: "Path manquant" }, { status: 400 });

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const viewer = authData.user;
  if (!viewer) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Trouver le profile cible à partir du path : on accepte deux conventions
  // historiques :  "users/<uuid>/<file>" et "<uuid>/<file>".
  const segments = key.split("/");
  const candidate = segments[0] === "users" ? segments[1] : segments[0];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate ?? "");
  if (!isUuid) return NextResponse.json({ error: "Path invalide" }, { status: 400 });
  const targetUserId = candidate;

  const isSuperAdmin = viewer.app_metadata?.role === "super_admin";
  const isOwner = viewer.id === targetUserId;

  let isDirectSponsor = false;
  if (!isOwner && !isSuperAdmin) {
    const { data: target } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("sponsor_id")
      .eq("id", targetUserId)
      .maybeSingle();
    isDirectSponsor = target?.sponsor_id === viewer.id;
  }

  if (!isOwner && !isSuperAdmin && !isDirectSponsor) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  try {
    const url = await getAvatarSignedUrl(key, 3600);
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error("[avatars] signed url error:", err);
    return NextResponse.json({ error: "Image indisponible" }, { status: 500 });
  }
}
