import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queueEmail } from "@/lib/email-queue";
import { he } from "@/lib/html-escape";
import { LOGO_IMG_HTML } from "@/lib/email-logo";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const body = await _req.json();
  const { target_professional_id } = body;

  if (!target_professional_id) {
    return NextResponse.json({ error: "ID du professionnel cible requis" }, { status: 400 });
  }

  // Récupérer la recommandation
  const { data: rec } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select("id, status, referrer_id, professional_id, contact_id, project_description, urgency_level")
    .eq("id", id)
    .single();

  if (!rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  // Vérifier que l'utilisateur connecté est le professionnel actuel
  if (rec.professional_id !== user.id) {
    return NextResponse.json({ error: "Seul le professionnel actuel peut transférer" }, { status: 403 });
  }

  // Vérifier que la recommandation est en statut PENDING (pas encore acceptée)
  if (rec.status !== "PENDING") {
    return NextResponse.json({ error: "Impossible de transférer une recommandation déjà en cours" }, { status: 400 });
  }

  // Vérifier que le pro cible existe et est bien un professionnel
  const { data: targetProfile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("id, first_name, last_name, email")
    .eq("id", target_professional_id)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "Professionnel cible introuvable" }, { status: 404 });
  }

  // Vérifier que le pro cible n'est pas le même que l'actuel
  if (targetProfile.id === rec.professional_id) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous transférer à vous-même" }, { status: 400 });
  }

  // Marquer la recommandation originale comme transférée
  const { error: updateErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .update({
      status: "TRANSFERRED",
      transferred_at: new Date().toISOString(),
      transfer_reason: "transfer",
    })
    .eq("id", rec.id);

  if (updateErr) {
    return NextResponse.json({ error: `Erreur transfert: ${updateErr.message}` }, { status: 500 });
  }

  // Créer une nouvelle recommandation pour le pro cible (même contact, même desc)
  const { data: newRec, error: newRecErr } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .insert({
      referrer_id: rec.referrer_id,
      professional_id: targetProfile.id,
      contact_id: rec.contact_id,
      project_description: rec.project_description,
      urgency_level: rec.urgency_level,
      status: "PENDING",
      original_recommendation_id: rec.id,
    })
    .select("id")
    .single();

  if (newRecErr) {
    return NextResponse.json({ error: `Erreur création nouvelle reco: ${newRecErr.message}` }, { status: 500 });
  }

  // Créer les recommendation_steps pour la nouvelle reco (comme dans create/route.ts)
  const { data: stepDefs } = await supabaseAdmin
    .schema("winelio")
    .from("steps")
    .select("id, order_index")
    .order("order_index");

  if (stepDefs && stepDefs.length > 0) {
    const now = new Date().toISOString();
    const stepRows = stepDefs.map((s) => ({
      recommendation_id: newRec.id,
      step_id: s.id,
      completed_at: s.order_index === 1 ? now : null,
    }));

    await supabaseAdmin
      .schema("winelio")
      .from("recommendation_steps")
      .insert(stepRows);
  }

  // Notifications email
  const { data: referrerProfile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("first_name, email")
    .eq("id", rec.referrer_id)
    .single();

  const { data: oldProProfile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("id", rec.professional_id)
    .single();

  if (oldProProfile?.email) {
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Recommandation transférée</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🔄</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Recommandation transférée</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">${he(oldProProfile.first_name || "")}</strong>,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Vous avez transféré la recommandation à <strong style="color:#2D3436;">${he(targetProfile.first_name || "")} ${he(targetProfile.last_name || "")}</strong>. Merci d'avoir élargi le réseau Winelio !</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    await queueEmail({ to: oldProProfile.email, subject: "Recommandation transférée", html }).catch(() => {});
  }

  if (referrerProfile?.email) {
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Recommandation transférée</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">🔄</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Recommandation transférée</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">${he(referrerProfile.first_name || "")}</strong>,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Le professionnel a transféré votre recommandation à <strong style="color:#2D3436;">${he(targetProfile.first_name || "")} ${he(targetProfile.last_name || "")}</strong>. Un nouveau professionnel va prendre le relais.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${SITE_URL}/recommendations/${newRec.id}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir la recommandation →</a></td></tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    await queueEmail({ to: referrerProfile.email, subject: "Votre recommandation a été transférée", html }).catch(() => {});
  }

  // Notifier le nouveau pro
  if (targetProfile.email) {
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Nouvelle recommandation transférée</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F2F4;"><tr><td align="center" style="padding:40px 20px;">
    <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
      <tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
      <tr><td style="background:#FFFFFF;padding:40px 48px 36px;border-radius:0 0 16px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="padding-bottom:24px;border-bottom:1px solid #F0F2F4;">${LOGO_IMG_HTML}</td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td width="52" height="52" style="background:linear-gradient(135deg,#FF6B35,#F7931E);border-radius:13px;text-align:center;vertical-align:middle;font-size:28px;line-height:52px;">📨</td></tr></table></td></tr>
          <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><h1 style="margin:0;color:#2D3436;font-size:22px;font-weight:700;">Nouvelle recommandation</h1></td></tr>
          <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Bonjour <strong style="color:#2D3436;">${he(targetProfile.first_name || "")}</strong>,</p></td></tr>
          <tr><td style="height:12px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><p style="margin:0;color:#636E72;font-size:15px;line-height:1.6;">Un confrère vous a transféré une recommandation. Découvrez-la et acceptez-la pour prendre en charge le client.</p></td></tr>
          <tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${SITE_URL}/recommendations/${newRec.id}" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;">Voir la recommandation →</a></td></tr></table></td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 0;"><p style="margin:0;color:#B2BAC0;font-size:12px;">© 2026 Winelio</p><p style="margin:4px 0 0;color:#FF6B35;font-size:12px;font-weight:600;">Recommandez. Gagnez.</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;
    await queueEmail({ to: targetProfile.email, subject: "📨 Une recommandation vous a été transférée !", html }).catch(() => {});
  }

  return NextResponse.json({ success: true, new_recommendation_id: newRec.id });
}
