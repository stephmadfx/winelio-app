import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CLAIM_ID, claimCookieName, hasClaimEmail, validClaimProof } from "@/lib/claim-access";

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Demande invalide" }, { status: 400 }); }
  const { recommendationId, companyId } = body || {};
  if (typeof recommendationId !== "string" || !CLAIM_ID.test(recommendationId) || typeof companyId !== "string" || !CLAIM_ID.test(companyId)) {
    return NextResponse.json({ error: "Recommandation et fiche professionnelle requises" }, { status: 400 });
  }
  const db = supabaseAdmin.schema("winelio");
  const { data: rec, error: recError } = await db.from("recommendations").select("id, professional_id").eq("id", recommendationId).maybeSingle();
  if (recError) return NextResponse.json({ error: "Vérification impossible. Réessayez." }, { status: 503 });
  if (!rec) return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  if (rec.professional_id === user.id) return NextResponse.json({ alreadyClaimed: true });
  const { data: pro, error: proError } = await db.from("profiles").select("email, companies(id, owner_id, source, email, deleted_at)").eq("id", rec.professional_id).maybeSingle();
  if (proError) return NextResponse.json({ error: "Vérification impossible. Réessayez." }, { status: 503 });
  const active = (Array.isArray(pro?.companies) ? pro.companies : pro?.companies ? [pro.companies] : []).filter(c => !c.deleted_at);
  if (active.length !== 1 || active[0].source !== "scraped") return NextResponse.json({ error: "Cette recommandation ne peut plus être récupérée par ce parcours." }, { status: 409 });
  const company = active[0];
  const proof = (await cookies()).get(claimCookieName(recommendationId))?.value;
  if (!validClaimProof(recommendationId, proof) && !hasClaimEmail(user, [company.email, pro?.email])) {
    return NextResponse.json({ error: "Ouvrez le lien reçu par e-mail ou connectez-vous avec l’adresse destinataire pour récupérer cette recommandation." }, { status: 403 });
  }
  const { data, error } = await db.rpc("finalize_professional_claim", {
    p_recommendation_id: recommendationId, p_user_id: user.id, p_expected_professional_id: rec.professional_id,
    p_source_company_id: company.id, p_destination_company_id: companyId,
  });
  if (error) return NextResponse.json({ error: "La récupération n’a pas abouti. Réessayez." }, { status: 503 });
  if (data?.error) {
    const message = data.error === "onboarding_required" ? "Créez et complétez d’abord votre fiche professionnelle et validez vos engagements."
      : data.error === "company_mismatch" ? "Le SIRET de votre fiche ne correspond pas à l’entreprise recommandée."
      : "Cette recommandation a déjà été récupérée ou nécessite une vérification par le support.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  return NextResponse.json(data);
}
