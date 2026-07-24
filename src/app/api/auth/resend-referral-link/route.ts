import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-sender";
import { buildReferralConfirmationEmail } from "@/lib/referral-confirmation-email";
import { PENDING_REFERRAL_STATUS } from "@/lib/pending-referral";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT = "Nouveau lien pour finaliser votre compte Winelio";
const GENERIC_MESSAGE = "Si ce compte attend encore son activation, un nouveau lien vient d’être envoyé.";
const MAX_PER_HOUR = 5;
const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

function isIpRateLimited(ip: string) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    ipBuckets.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > IP_LIMIT;
}

function genericResponse() {
  return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";
    if (isIpRateLimited(ip)) return genericResponse();

    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return genericResponse();

    const oneHourAgo = new Date(Date.now() - IP_WINDOW_MS).toISOString();
    const { count } = await supabaseAdmin.schema("winelio").from("email_sent_log")
      .select("id", { count: "exact", head: true })
      .eq("to_email", email)
      .eq("subject", SUBJECT)
      .eq("success", true)
      .gte("sent_at", oneHourAgo);
    if ((count ?? 0) >= MAX_PER_HOUR) return genericResponse();

    const { data: profile } = await supabaseAdmin.from("profiles")
      .select("id, email, first_name, last_name, sponsor_id, onboarding_status")
      .ilike("email", email)
      .maybeSingle();
    if (!profile || profile.onboarding_status !== PENDING_REFERRAL_STATUS || !profile.sponsor_id) {
      return genericResponse();
    }

    const [{ data: authData }, { data: sponsor }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(profile.id),
      supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", profile.sponsor_id).maybeSingle(),
    ]);
    if (!authData.user || authData.user.user_metadata?.requires_password_setup !== true) {
      return genericResponse();
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appUrl}/auth/callback` },
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("[resend-referral-link] generateLink failed", linkError?.message);
      return genericResponse();
    }

    const confirmLink = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&setup_password=1`;
    const firstName = profile.first_name || "";
    const sponsorName = [sponsor?.first_name, sponsor?.last_name].filter(Boolean).join(" ") || "Votre parrain";
    const result = await sendEmail({
      to: email,
      toName: [profile.first_name, profile.last_name].filter(Boolean).join(" "),
      subject: SUBJECT,
      text: `Bonjour ${firstName},\n\nVoici votre nouveau lien pour finaliser votre compte Winelio et créer votre mot de passe :\n${confirmLink}\n\nCe lien personnel remplace le précédent.`,
      html: buildReferralConfirmationEmail(firstName, sponsorName, confirmLink, true),
    });
    if (!result.ok) console.error("[resend-referral-link] email failed", result.error);
    return genericResponse();
  } catch (error) {
    console.error("[resend-referral-link] unexpected error", error instanceof Error ? error.message : "unknown");
    return genericResponse();
  }
}
