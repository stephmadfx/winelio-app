import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAvatarStream } from "@/lib/r2-avatars";

// Route auth-protégée qui sert les photos de profil depuis R2 privé.
// Règles d'accès :
//   - Owner : oui (sa propre photo).
//   - Sponsor direct (niveau 1) : oui (relation MLM contractuelle).
//   - Super admin : oui (gestion).
//   - Membre du même réseau MLM (niveaux 2-5) : non, on retombe sur les initiales.
//   - Anonyme : 401.
//
// Réponse : on STREAM l'image directement (pas de redirect vers R2) pour ne jamais
// exposer l'endpoint S3 au client et éviter d'avoir à élargir la CSP.

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
    const obj = await getAvatarStream(key);
    if (!obj) return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });

    const headers: Record<string, string> = {
      "Content-Type": obj.contentType,
      "Cache-Control": "private, max-age=3600",
    };
    if (obj.contentLength) headers["Content-Length"] = String(obj.contentLength);

    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    console.error("[avatars] stream error:", err);
    return NextResponse.json({ error: "Image indisponible" }, { status: 500 });
  }
}
