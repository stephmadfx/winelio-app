import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { he } from "@/lib/html-escape";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type NewsletterFilters = {
  audience?: "all" | "professionals" | "individuals";
  onlyActive?: boolean;
};

export type NewsletterPayload = {
  subject: string;
  content: string;
  recipientFilters: NewsletterFilters;
  selectedRecipientIds: string[];
  excludedRecipientIds: string[];
  manualEmails: string[];
};

type Recipient = {
  userId: string | null;
  email: string;
  recipientType: "profile" | "professional" | "manual";
  name?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NEWSLETTER_LOGO_HTML =
  '<img src="https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/logo-color.png" alt="Winelio" width="160" height="44" style="display:block;margin:0 auto;border:0;max-width:160px;" />';

export const newsletterAppUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "");

export const assertSuperAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  }

  if (user.app_metadata?.role !== "super_admin") {
    return { user: null, response: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  return { user, response: null };
};

export const parseManualEmails = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return [...new Set(
    raw
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
};

export const invalidEmails = (emails: string[]) => emails.filter((email) => !EMAIL_RE.test(email));

export const normalizeNewsletterPayload = (body: Record<string, unknown>): NewsletterPayload => {
  const filters = (body.recipientFilters ?? body.recipient_filters ?? {}) as NewsletterFilters;
  return {
    subject: String(body.subject ?? "").trim(),
    content: String(body.content ?? "").trim(),
    recipientFilters: {
      audience: filters.audience ?? "all",
      onlyActive: filters.onlyActive !== false,
    },
    selectedRecipientIds: Array.isArray(body.selectedRecipientIds)
      ? body.selectedRecipientIds.filter((id): id is string => typeof id === "string")
      : [],
    excludedRecipientIds: Array.isArray(body.excludedRecipientIds)
      ? body.excludedRecipientIds.filter((id): id is string => typeof id === "string")
      : [],
    manualEmails: parseManualEmails(body.manualEmails),
  };
};

export const validateNewsletterPayload = (payload: NewsletterPayload) => {
  if (!payload.subject) return "Le sujet est obligatoire";
  if (!payload.content) return "Le contenu est obligatoire";
  const invalid = invalidEmails(payload.manualEmails);
  if (invalid.length > 0) return `Emails invalides : ${invalid.slice(0, 5).join(", ")}`;
  return null;
};

export const resolveNewsletterRecipients = async (
  filters: NewsletterFilters,
  selectedRecipientIds: string[],
  excludedRecipientIds: string[],
  manualEmails: string[]
): Promise<Recipient[]> => {
  let query = supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name, is_professional, is_active")
    .not("email", "is", null)
    .order("created_at", { ascending: false });

  if (selectedRecipientIds.length > 0) {
    query = query.in("id", selectedRecipientIds);
  } else {
    if (filters.audience === "professionals") query = query.eq("is_professional", true);
    if (filters.audience === "individuals") query = query.eq("is_professional", false);
    if (filters.onlyActive !== false) query = query.eq("is_active", true);
  }

  if (excludedRecipientIds.length > 0) {
    query = query.not("id", "in", `(${excludedRecipientIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const byEmail = new Map<string, Recipient>();
  for (const profile of data ?? []) {
    const email = String(profile.email ?? "").toLowerCase();
    if (!EMAIL_RE.test(email)) continue;
    byEmail.set(email, {
      userId: profile.id,
      email,
      recipientType: profile.is_professional ? "professional" : "profile",
      name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
    });
  }

  for (const email of manualEmails) {
    if (!EMAIL_RE.test(email)) continue;
    byEmail.set(email, { userId: null, email, recipientType: "manual" });
  }

  return [...byEmail.values()];
};

export const buildNewsletterHtml = ({
  subject,
  content,
  recipientId,
  unsubscribeToken,
}: {
  subject: string;
  content: string;
  recipientId?: string;
  unsubscribeToken?: string;
}) => {
  const appUrl = newsletterAppUrl();
  const trackingPixel = recipientId
    ? `<img src="${appUrl}/api/newsletter/track/open/${recipientId}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px;" />`
    : "";
  const unsubscribeUrl = unsubscribeToken
    ? `${appUrl}/api/newsletter/unsubscribe/${unsubscribeToken}`
    : `${appUrl}/settings`;
  const body = renderContent(content, recipientId);

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${he(subject)}</title></head>
<body style="margin:0;padding:0;background:#F0F2F4;font-family:Arial,sans-serif;">
${trackingPixel}
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#F0F2F4;">
<tr><td align="center" style="padding:40px 20px;">
<table width="520" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;width:100%;">
<tr><td style="background:linear-gradient(90deg,#FF6B35,#F7931E);height:4px;font-size:0;line-height:0;border-radius:4px 4px 0 0;">&nbsp;</td></tr>
<tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:40px 48px 36px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr><td align="center">${NEWSLETTER_LOGO_HTML}</td></tr>
<tr><td style="height:24px;font-size:0;line-height:0;border-bottom:1px solid #F0F2F4;">&nbsp;</td></tr>
<tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td><h1 style="color:#2D3436;font-size:22px;line-height:1.3;text-align:center;margin:0;">${he(subject)}</h1></td></tr>
<tr><td style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="color:#2D3436;font-size:15px;line-height:1.7;">${body}</td></tr>
<tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="border-top:1px solid #F0F2F4;padding-top:18px;text-align:center;">
<a href="${he(unsubscribeUrl)}" style="color:#8B949E;font-size:12px;text-decoration:underline;">Se désinscrire des newsletters</a>
</td></tr>
</table>
</td></tr>
<tr><td style="text-align:center;padding:16px 0;">
<p style="color:#B2BAC0;font-size:11px;margin:0;">© 2026 Winelio</p>
<p style="color:#FF6B35;font-size:11px;margin:4px 0 0;">Recommandez. Connectez. Gagnez.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

export const recordNewsletterEvent = async ({
  recipientId,
  eventType,
  request,
  url,
}: {
  recipientId: string;
  eventType: "opened" | "clicked" | "unsubscribed";
  request?: Request;
  url?: string;
}) => {
  const { data: recipient } = await supabaseAdmin
    .from("newsletter_recipients")
    .select("id, newsletter_id, opened_at, clicked_at, unsubscribed_at")
    .eq("id", recipientId)
    .maybeSingle();

  if (!recipient) return;

  const ip = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const userAgent = request?.headers.get("user-agent") ?? null;
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex") : null;

  await supabaseAdmin.from("newsletter_events").insert({
    newsletter_id: recipient.newsletter_id,
    recipient_id: recipient.id,
    event_type: eventType,
    url,
    user_agent: userAgent,
    ip_hash: ipHash,
  });

  if (eventType === "opened" && !recipient.opened_at) {
    await supabaseAdmin.from("newsletter_recipients").update({ opened_at: new Date().toISOString() }).eq("id", recipient.id);
    await recomputeNewsletterStats(recipient.newsletter_id);
  }

  if (eventType === "clicked" && !recipient.clicked_at) {
    await supabaseAdmin.from("newsletter_recipients").update({ clicked_at: new Date().toISOString() }).eq("id", recipient.id);
    await recomputeNewsletterStats(recipient.newsletter_id);
  }

  if (eventType === "unsubscribed" && !recipient.unsubscribed_at) {
    await supabaseAdmin.from("newsletter_recipients").update({ unsubscribed_at: new Date().toISOString() }).eq("id", recipient.id);
  }
};

export const recomputeNewsletterStats = async (newsletterId: string) => {
  const { data } = await supabaseAdmin
    .from("newsletter_recipients")
    .select("sent_at, failed_at, opened_at, clicked_at")
    .eq("newsletter_id", newsletterId);

  const rows = data ?? [];
  await supabaseAdmin
    .from("newsletters")
    .update({
      recipient_count: rows.length,
      sent_count: rows.filter((row) => row.sent_at).length,
      failed_count: rows.filter((row) => row.failed_at).length,
      opened_count: rows.filter((row) => row.opened_at).length,
      clicked_count: rows.filter((row) => row.clicked_at).length,
    })
    .eq("id", newsletterId);
};

export const sendNewsletter = async (newsletterId: string) => {
  const { data: newsletter, error } = await supabaseAdmin
    .from("newsletters")
    .select("*")
    .eq("id", newsletterId)
    .single();

  if (error || !newsletter) throw new Error(error?.message ?? "Newsletter introuvable");
  if (newsletter.status !== "draft" && newsletter.status !== "failed") {
    throw new Error("Cette newsletter ne peut plus être envoyée");
  }

  const recipients = await resolveNewsletterRecipients(
    newsletter.recipient_filters as NewsletterFilters,
    newsletter.selected_recipient_ids ?? [],
    newsletter.excluded_recipient_ids ?? [],
    newsletter.manual_emails ?? []
  );

  await supabaseAdmin.from("newsletters").update({ status: "sending", recipient_count: recipients.length }).eq("id", newsletterId);
  await supabaseAdmin.from("newsletter_recipients").delete().eq("newsletter_id", newsletterId);

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const { data: saved, error: recipientError } = await supabaseAdmin
      .from("newsletter_recipients")
      .insert({
        newsletter_id: newsletterId,
        user_id: recipient.userId,
        email: recipient.email,
        recipient_type: recipient.recipientType,
      })
      .select("id, unsubscribe_token")
      .single();

    if (recipientError || !saved) {
      failed += 1;
      continue;
    }

    try {
      await sendMailWithTimeout({
        from: SMTP_FROM,
        to: recipient.email,
        subject: newsletter.subject,
        text: newsletter.content,
        html: buildNewsletterHtml({
          subject: newsletter.subject,
          content: newsletter.content,
          recipientId: saved.id,
          unsubscribeToken: saved.unsubscribe_token,
        }),
      });

      sent += 1;
      await supabaseAdmin
        .from("newsletter_recipients")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", saved.id);
      await supabaseAdmin.from("newsletter_events").insert({
        newsletter_id: newsletterId,
        recipient_id: saved.id,
        event_type: "sent",
      });
    } catch (sendError) {
      failed += 1;
      await supabaseAdmin
        .from("newsletter_recipients")
        .update({
          failed_at: new Date().toISOString(),
          failure_reason: sendError instanceof Error ? sendError.message : "Erreur SMTP",
        })
        .eq("id", saved.id);
      await supabaseAdmin.from("newsletter_events").insert({
        newsletter_id: newsletterId,
        recipient_id: saved.id,
        event_type: "failed",
      });
    }
  }

  await supabaseAdmin
    .from("newsletters")
    .update({
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
      opened_count: 0,
      clicked_count: 0,
    })
    .eq("id", newsletterId);

  return { sent, failed, total: recipients.length };
};

const renderContent = (content: string, recipientId?: string) => {
  const escaped = he(content);
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const href = recipientId
      ? `${newsletterAppUrl()}/api/newsletter/track/click/${recipientId}?u=${encodeURIComponent(url)}`
      : url;
    return `<a href="${he(href)}" style="color:#FF6B35;text-decoration:underline;">${he(url)}</a>`;
  });

  return linked
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
};
