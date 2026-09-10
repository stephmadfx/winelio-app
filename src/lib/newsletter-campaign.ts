import { createHash, randomBytes } from "crypto";
import { he } from "@/lib/html-escape";
import { sendMailWithTimeout, SMTP_FROM } from "@/lib/email-transporter";
import { resolveNewsletterAudience, type NewsletterAudienceFilters } from "@/lib/newsletter-audience";
import { applyNewsletterVariables, fetchNewsletterVariablesForEmail } from "@/lib/newsletter-variables";
import { supabaseAdmin } from "@/lib/supabase/admin";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

const addCampaignTracking = (html: string, recipientId: string, unsubscribeToken: string) => {
  const unsubscribeUrl = `${APP_URL}/api/newsletter/unsubscribe/${unsubscribeToken}`;
  const withUnsubscribe = html.replace(/https?:\/\/[^"']*\/newsletter\/unsubscribe\?email=[^"']*/gi, unsubscribeUrl);
  const withLinks = withUnsubscribe.replace(/href=("|')(https?:\/\/[^"']+)\1/gi, (match, quote: string, url: string) => {
    if (url === unsubscribeUrl) return match;
    return `href=${quote}${APP_URL}/api/newsletter/track/click/${recipientId}?u=${encodeURIComponent(url)}${quote}`;
  });
  const pixel = `<img src="${APP_URL}/api/newsletter/track/open/${recipientId}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px;" />`;
  return withLinks.replace(/<body([^>]*)>/i, `<body$1>${pixel}`);
};

export const sendNewsletterTemplateCampaign = async ({
  templateId,
  filters,
  expectedCount,
  userId,
}: {
  templateId: string;
  filters: NewsletterAudienceFilters;
  expectedCount: number;
  userId: string;
}) => {
  const { data: template, error } = await supabaseAdmin
    .from("newsletter_templates")
    .select("id, name, subject, preheader, html_content, last_campaign_id, last_campaign_fingerprint")
    .eq("id", templateId)
    .eq("user_id", userId)
    .single();
  if (error || !template) throw new Error("Newsletter introuvable");
  if (!template.subject.trim() || !template.html_content.trim()) throw new Error("Sujet et contenu requis");

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ subject: template.subject, html: template.html_content, filters }))
    .digest("hex");
  if (template.last_campaign_id && template.last_campaign_fingerprint === fingerprint) {
    const { data: existing } = await supabaseAdmin.from("newsletters").select("status, sent_count, failed_count, recipient_count").eq("id", template.last_campaign_id).maybeSingle();
    if (existing && ["sending", "sent"].includes(existing.status)) {
      throw new Error("Cette version a déjà été envoyée. Dupliquez ou modifiez puis sauvegardez la newsletter pour créer une nouvelle campagne.");
    }
  }

  const resolved = await resolveNewsletterAudience(filters);
  if (resolved.length !== expectedCount) {
    throw new Error(`L'audience a changé (${expectedCount} → ${resolved.length}). Vérifiez l'aperçu puis confirmez à nouveau.`);
  }

  const { data: suppressions } = await supabaseAdmin.from("newsletter_suppressions").select("email");
  const suppressedEmails = new Set((suppressions ?? []).map((row) => row.email.toLowerCase()));
  const recipients = resolved.filter((recipient) => !suppressedEmails.has(recipient.email.toLowerCase()));
  const suppressed = resolved.length - recipients.length;
  if (recipients.length === 0) throw new Error("Tous les destinataires ciblés sont désinscrits");

  const { data: campaign, error: campaignError } = await supabaseAdmin.from("newsletters").insert({
    subject: template.subject,
    content: template.preheader,
    html_content: template.html_content,
    status: "sending",
    recipient_filters: filters,
    recipient_count: recipients.length,
    created_by: userId,
  }).select("id").single();
  if (campaignError || !campaign) throw new Error(campaignError?.message || "Création de campagne impossible");

  await supabaseAdmin.from("newsletter_templates").update({ last_campaign_id: campaign.id, last_campaign_fingerprint: fingerprint }).eq("id", template.id).eq("user_id", userId);

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    const unsubscribeToken = randomBytes(24).toString("hex");
    const { data: saved, error: recipientError } = await supabaseAdmin.from("newsletter_recipients").insert({
      newsletter_id: campaign.id,
      user_id: recipient.userId,
      email: recipient.email.toLowerCase(),
      recipient_type: recipient.isProfessional ? "professional" : "profile",
      unsubscribe_token: unsubscribeToken,
    }).select("id").single();
    if (recipientError || !saved) { failed += 1; continue; }

    try {
      const variables = await fetchNewsletterVariablesForEmail(recipient.email);
      const personalized = applyNewsletterVariables(template.html_content, variables);
      await sendMailWithTimeout({
        from: SMTP_FROM,
        to: recipient.email,
        subject: applyNewsletterVariables(template.subject, variables),
        text: template.preheader || `Newsletter Winelio : ${template.subject}`,
        html: addCampaignTracking(personalized, saved.id, unsubscribeToken),
        headers: { "List-Unsubscribe": `<${APP_URL}/api/newsletter/unsubscribe/${unsubscribeToken}>` },
      });
      sent += 1;
      await supabaseAdmin.from("newsletter_recipients").update({ sent_at: new Date().toISOString() }).eq("id", saved.id);
      await supabaseAdmin.from("newsletter_events").insert({ newsletter_id: campaign.id, recipient_id: saved.id, event_type: "sent" });
    } catch (sendError) {
      failed += 1;
      const reason = sendError instanceof Error ? sendError.message.slice(0, 500) : "Erreur d'envoi";
      await supabaseAdmin.from("newsletter_recipients").update({ failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", saved.id);
      await supabaseAdmin.from("newsletter_events").insert({ newsletter_id: campaign.id, recipient_id: saved.id, event_type: "failed" });
    }
  }

  await supabaseAdmin.from("newsletters").update({
    status: sent === 0 ? "failed" : "sent",
    sent_at: new Date().toISOString(),
    sent_count: sent,
    failed_count: failed,
  }).eq("id", campaign.id);

  if (sent === 0) throw new Error(`Aucun email envoyé (${failed} échec${failed > 1 ? "s" : ""})`);
  return { campaignId: campaign.id, sent, failed, suppressed, total: resolved.length, subject: he(template.subject) };
};
