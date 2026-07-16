import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Lie le user connecté à la company associée à une recommandation scrapée.
 * Appelée depuis /claim/[recommendationId] une fois le user authentifié.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { recommendationId } = (await req.json()) as { recommendationId?: string };
  if (!recommendationId) {
    return NextResponse.json({ error: "recommendationId requis" }, { status: 400 });
  }

  const { data: rec, error: recErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("id, professional_id")
    .eq("id", recommendationId)
    .single();

  if (recErr || !rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  // La company revendiquée est celle liée au professional de la reco
  const { data: pro } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("id")
    .eq("id", rec.professional_id)
    .single();

  const { data: company } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .select("id, owner_id, source, category_id")
    .eq("owner_id", pro?.id ?? "")
    .maybeSingle();

  if (!company) {
    return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  }

  // Si déjà claimée par ce user → rien à faire
  if (company.source === "owner" && company.owner_id === user.id) {
    return NextResponse.json({ alreadyClaimed: true });
  }

  // Si déjà claimée par un autre user → refuser
  if (company.source === "owner" && company.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Cette fiche a déjà été revendiquée par un autre utilisateur" },
      { status: 409 }
    );
  }

  // 1. Récupérer le SIRET et le code APE/NAF depuis les métadonnées de l'utilisateur
  const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(user.id);
  const siret = authUser?.user_metadata?.siret;
  const nafCode = authUser?.user_metadata?.naf_code;
  const firstName = authUser?.user_metadata?.first_name || "";
  const emailTo = authUser?.email || user.email || "";

  // Transférer le owner_id au user connecté + marquer comme owner + enregistrer SIRET/NAF
  const { error: updateErr } = await supabaseAdmin
    .schema("winelio")
    .from("companies")
    .update({
      owner_id: user.id,
      source: "owner",
      is_verified: true,
      siret: siret || undefined,
      naf_code: nafCode || undefined,
    })
    .eq("id", company.id);

  if (updateErr) {
    return NextResponse.json({ error: `Erreur claim: ${updateErr.message}` }, { status: 500 });
  }

  // 2. Rediriger la reco vers le nouveau user (l'ancien professional_id sera remplacé)
  await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({ professional_id: user.id })
    .eq("id", recommendationId);

  // 3. Marquer le profile comme is_professional et pro_engagement_accepted
  const { data: previousProfile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("is_professional")
    .eq("id", user.id)
    .single();

  const wasAlreadyPro = !!previousProfile?.is_professional;

  await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .update({
      is_professional: true,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  // 4. Notifier le parrain direct si première activation
  if (!wasAlreadyPro) {
    const { data: cat } = await supabaseAdmin
      .schema("winelio")
      .from("categories")
      .select("name")
      .eq("id", company.category_id ?? "")
      .maybeSingle();

    const { notifyNewProInNetwork } = await import("@/lib/notify-new-pro-in-network");
    notifyNewProInNetwork(user.id, {
      categoryName: cat?.name ?? null,
      workMode: null,
    }).catch((err) =>
      console.error("[claim-finalize] Erreur notify-new-pro-in-network:", err)
    );

    // 5. Mettre en file d'attente l'e-mail de relance pro à envoyer 24 heures après
    const origin = req.headers.get("origin") || new URL(req.url).origin;
    const finalizeEmailHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#F0F2F4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F2F4;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <!-- Barre accent -->
          <tr>
            <td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td>
          </tr>
          <!-- Carte Blanche -->
          <tr>
            <td style="background-color:#ffffff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
              <!-- Logo -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">
                    <img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" alt="Winelio">
                  </td>
                </tr>
              </table>
              
              <!-- Content -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="color:#2D3436;font-size:20px;font-weight:bold;text-align:center;line-height:1.4;">
                    Finalisez votre compte professionnel
                  </td>
                </tr>
                <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td style="color:#636E72;font-size:14px;line-height:1.6;text-align:left;">
                    Bonjour ${firstName},<br><br>
                    Félicitations pour la création de votre compte professionnel sur Winelio !<br><br>
                    Pour commencer à recevoir des recommandations et développer pleinement votre activité, veuillez finaliser la configuration de votre compte professionnel en complétant vos informations d'entreprise (assurance décennale, logo, description, etc.) :
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <!-- Button -->
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td align="center" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:12px;">
                          <a href="${origin}/profile/pro-onboarding" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:12px;background:linear-gradient(135deg,#FF6B35,#F7931E);">
                            Compléter mon profil pro →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="text-align:center;padding:24px 0 0 0;">
              <p style="color:#B2BAC0;font-size:11px;margin:0 0 4px;">© 2026 Winelio · Recommandez. Connectez. Gagnez.</p>
              <p style="color:#FF6B35;font-size:11px;font-weight:bold;margin:0;">Winelio</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const scheduledAt = new Date();
    scheduledAt.setHours(scheduledAt.getHours() + 24);

    const { error: queueError } = await supabaseAdmin
      .schema("winelio")
      .from("email_queue")
      .insert({
        to_email: emailTo,
        to_name: `${firstName}`.trim() || null,
        subject: "Finalisez votre compte professionnel sur Winelio",
        html: finalizeEmailHtml,
        scheduled_at: scheduledAt.toISOString(),
        dedupe_key: `pro-finalize-${user.id}`,
      });
    if (queueError) {
      console.error("[claim-finalize] Erreur queue pro-finalize email:", queueError);
    }
  }

  return NextResponse.json({ success: true });
}
