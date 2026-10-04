import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addCampaignTracking } from "@/lib/newsletter-campaign";
import { sendNewsletterEmail } from "@/lib/newsletter-email-service";

export type TestDelivery = { to: string; subject: string; html: string; preheader: string };
const checked = <T extends { error: unknown }>(result: T): T => {
  if (result.error) throw new Error("Impossible d’enregistrer le suivi du test");
  return result;
};

export async function sendTrackedNewsletterTest({ deliveries, userId, templateId }: {
  deliveries: TestDelivery[]; userId: string; templateId?: string;
}) {
  if (!deliveries.length) throw new Error("Aucun destinataire de test");
  // Ownership is checked before any provider call or tracking mutation.
  if (templateId) {
    const template = checked(await supabaseAdmin.from("newsletter_templates").select("id").eq("id", templateId).eq("user_id", userId).maybeSingle());
    if (!template.data) throw new Error("Newsletter introuvable");
  }
  const campaign = checked(await supabaseAdmin.from("newsletters").insert({
    subject: `[TEST] ${deliveries[0].subject || "Newsletter Winelio"}`, content: deliveries[0].preheader,
    html_content: deliveries[0].html, is_test: true, status: "sending", created_by: userId,
    recipient_count: deliveries.length,
  }).select("id").single());
  if (!campaign.data) throw new Error("Création du rapport de test impossible");
  const campaignId = campaign.data.id;
  let sent = 0; let failed = 0;
  const messageIds: string[] = [];
  for (const delivery of deliveries) {
    const token = randomBytes(24).toString("hex");
    const recipient = await supabaseAdmin.from("newsletter_recipients").insert({
      newsletter_id: campaignId, email: delivery.to.toLowerCase(), recipient_type: "manual", unsubscribe_token: token,
    }).select("id").single();
    if (recipient.error || !recipient.data) { failed++; continue; }
    const recipientId = recipient.data.id;
    let result;
    try {
      result = await sendNewsletterEmail({ to: delivery.to, subject: delivery.subject,
        text: delivery.preheader || "Aperçu de newsletter Winelio.",
        html: addCampaignTracking(delivery.html, recipientId, token), test: true, campaignId });
    } catch {
      failed++;
      checked(await supabaseAdmin.from("newsletter_recipients").update({ failed_at: new Date().toISOString(), failure_reason: "Envoi du test refusé ou non confirmé par le service email" }).eq("id", recipientId));
      checked(await supabaseAdmin.from("newsletter_events").insert({ newsletter_id: campaignId, recipient_id: recipientId, event_type: "failed" }));
      continue;
    }
    sent++; messageIds.push(result.messageId);
    checked(await supabaseAdmin.from("newsletter_recipients").update({ sent_at: new Date().toISOString(), delivery_provider: result.provider, provider_message_id: result.messageId }).eq("id", recipientId));
    checked(await supabaseAdmin.from("newsletter_events").insert({ newsletter_id: campaignId, recipient_id: recipientId, event_type: "sent" }));
  }
  checked(await supabaseAdmin.from("newsletters").update({ status: sent ? "sent" : "failed", sent_at: new Date().toISOString(), sent_count: sent, failed_count: failed }).eq("id", campaignId));
  if (templateId) checked(await supabaseAdmin.from("newsletter_templates").update({ last_test_campaign_id: campaignId, ...(sent ? { test_sent_at: new Date().toISOString() } : {}) }).eq("id", templateId).eq("user_id", userId));
  return { success: sent > 0, sent, failed, campaignId, messageIds, provider: "resend" };
}
