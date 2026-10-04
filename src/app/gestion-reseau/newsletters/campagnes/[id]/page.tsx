import { NewsletterCampaignReport } from "@/components/admin/newsletters/NewsletterCampaignReport";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await assertNewsletterAdmin();
  const { id } = await params;
  return <NewsletterCampaignReport campaignId={id} />;
}
