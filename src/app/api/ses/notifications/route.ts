import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Rebonds / plaintes Amazon SES reçus via SNS (sujet SES_SNS_TOPIC_ARN).
 * Rebond permanent ou plainte → adresse ajoutée à winelio.newsletter_suppressions
 * (reason "bounce" / "complaint"). Les newsletters l'excluent ; les mails
 * transactionnels ne sont plus envoyés aux adresses en rebond (cf. email-sender).
 */

type SnsMessage = Record<string, string | undefined>;

const snsCerts = new Map<string, string>();

function isAwsSnsUrl(raw?: string): boolean {
  try {
    const u = new URL(raw || "");
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  const certUrl = msg.SigningCertURL;
  if (!certUrl || !isAwsSnsUrl(certUrl) || !certUrl.endsWith(".pem") || !msg.Signature) return false;
  const fields = msg.Type === "Notification"
    ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  const canonical = fields.filter((k) => msg[k] !== undefined).map((k) => `${k}\n${msg[k]}\n`).join("");
  let cert = snsCerts.get(certUrl);
  if (!cert) {
    const res = await fetch(certUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    cert = await res.text();
    snsCerts.set(certUrl, cert);
  }
  const verifier = crypto.createVerify(msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  verifier.update(canonical, "utf8");
  return verifier.verify(cert, msg.Signature, "base64");
}

async function suppress(email: string, reason: "bounce" | "complaint") {
  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("newsletter_suppressions")
    .upsert({ email: email.trim().toLowerCase(), reason }, { onConflict: "email" });
  if (error) throw error;
}

export async function POST(req: Request) {
  // Fermé par défaut : sans sujet configuré, n'importe quel compte AWS pourrait signer des rebonds.
  const topic = process.env.SES_SNS_TOPIC_ARN;
  if (!topic) return NextResponse.json({ error: "SNS non configuré" }, { status: 503 });

  let msg: SnsMessage;
  try {
    msg = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (msg.TopicArn !== topic) return NextResponse.json({ error: "TopicArn invalide" }, { status: 403 });
  if (!(await verifySnsSignature(msg))) return NextResponse.json({ error: "Signature SNS invalide" }, { status: 403 });

  if (msg.Type === "SubscriptionConfirmation") {
    if (!isAwsSnsUrl(msg.SubscribeURL)) return NextResponse.json({ error: "SubscribeURL invalide" }, { status: 400 });
    await fetch(msg.SubscribeURL!, { signal: AbortSignal.timeout(10_000) });
    return NextResponse.json({ confirmed: true });
  }
  if (msg.Type !== "Notification" || !msg.Message) return NextResponse.json({ ignored: true });

  const payload = JSON.parse(msg.Message);
  const type = payload.notificationType || payload.eventType;
  const bounces: { emailAddress?: string }[] =
    type === "Bounce" && payload.bounce?.bounceType === "Permanent" ? payload.bounce.bouncedRecipients ?? [] : [];
  const complaints: { emailAddress?: string }[] =
    type === "Complaint" ? payload.complaint?.complainedRecipients ?? [] : [];

  for (const r of bounces) if (r.emailAddress) await suppress(r.emailAddress, "bounce");
  for (const r of complaints) if (r.emailAddress) await suppress(r.emailAddress, "complaint");
  if (bounces.length || complaints.length) {
    console.warn(`[ses] ${type} : ${[...bounces, ...complaints].map((r) => r.emailAddress).join(", ")}`);
  }
  return NextResponse.json({ suppressed: bounces.length + complaints.length });
}
