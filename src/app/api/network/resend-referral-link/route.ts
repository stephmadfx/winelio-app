import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";
import { buildReferralConfirmationEmail } from "@/lib/referral-confirmation-email";
import { PENDING_REFERRAL_STATUS } from "@/lib/pending-referral";

const SUBJECT = "Nouveau lien pour finaliser votre compte Winelio";
const COOLDOWN_MINUTES = 5;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const referralId = typeof body.referralId === "string" ? body.referralId : "";
  if (!referralId) return NextResponse.json({ error: "Filleul manquant." }, { status: 400 });

  const { data: referral } = await supabaseAdmin.from("profiles")
    .select("id, email, first_name, last_name, sponsor_id, onboarding_status")
    .eq("id", referralId)
    .maybeSingle();

  if (!referral || referral.sponsor_id !== user.id) {
    return NextResponse.json({ error: "Seul le parrain direct peut relancer ce filleul." }, { status: 403 });
  }
  if (referral.onboarding_status !== PENDING_REFERRAL_STATUS || !referral.email) {
    return NextResponse.json({ error: "Ce compte n’est plus en attente d’activation." }, { status: 409 });
  }

  const cooldownStart = new Date(Date.now() - COOLDOWN_MINUTES * 60_000).toISOString();
  const { count } = await supabaseAdmin.schema("winelio").from("email_sent_log")
    .select("id", { count: "exact", head: true })
    .eq("to_email", referral.email)
    .eq("subject", SUBJECT)
    .eq("success", true)
    .gte("sent_at", cooldownStart);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Un lien vient déjà d’être envoyé. Patientez 5 minutes avant une nouvelle relance." }, { status: 429 });
  }

  const [{ data: authData }, { data: sponsor }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(referral.id),
    supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!authData.user || authData.user.user_metadata?.requires_password_setup !== true) {
    return NextResponse.json({ error: "Ce compte n’est plus en attente d’activation." }, { status: 409 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: referral.email,
    options: { redirectTo: `${appUrl}/auth/callback` },
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error("[network/resend-referral-link] generateLink failed", linkError?.message);
    return NextResponse.json({ error: "Impossible de générer le nouveau lien." }, { status: 500 });
  }

  const confirmLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&setup_password=1`;
  const firstName = referral.first_name || "";
  const sponsorName = [sponsor?.first_name, sponsor?.last_name].filter(Boolean).join(" ") || "Votre parrain";
  const result = await sendEmail({
    to: referral.email,
    toName: [referral.first_name, referral.last_name].filter(Boolean).join(" "),
    subject: SUBJECT,
    text: `Bonjour ${firstName},\n\nVoici votre nouveau lien pour finaliser votre compte Winelio et créer votre mot de passe :\n${confirmLink}\n\nCe lien personnel remplace le précédent.`,
    html: buildReferralConfirmationEmail(firstName, sponsorName, confirmLink, true),
  });
  if (!result.ok) {
    console.error("[network/resend-referral-link] email failed", result.error);
    return NextResponse.json({ error: "L’e-mail n’a pas pu être envoyé." }, { status: 502 });
  }

  return NextResponse.json({ success: true, message: "Le nouveau lien d’activation a bien été envoyé." });
}
