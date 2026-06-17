import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { advanceRecommendationStep, toggleRecommendationStatus } from "../../actions";
import { addRecoAnnotation, deleteRecoAnnotation } from "./actions";
import { RecoJourneyView, type AnnotationRow, type StepRow } from "@/components/admin/RecoJourneyView";
import { FollowupTimeline } from "@/components/admin/FollowupTimeline";

export default async function AdminRecoDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: reco }, { data: annotationsRaw }] = await Promise.all([
    supabaseAdmin
      .from("recommendations")
      .select(`
        id, status, amount, compensation_plan_id,
        referrer:profiles!referrer_id(first_name, last_name, email),
        professional:profiles!professional_id(first_name, last_name, email),
        recommendation_steps(id, completed_at, step:steps(order_index, name))
      `)
      .eq("id", id)
      .single(),
    supabaseAdmin
      .from("recommendation_annotations")
      .select("id, recommendation_step_id, content, created_at, author:profiles!author_id(id, first_name, last_name)")
      .eq("recommendation_id", id)
      .order("created_at"),
  ]);

  if (!reco) notFound();

  // Résoudre le plan de commission depuis la recommandation ou le plan par défaut.
  let commissionPlan: {
    commission_rate: number | null;
    high_amount_threshold?: number | null;
    high_amount_commission_rate?: number | null;
  } | null = null;
  if (reco.compensation_plan_id) {
    const { data: plan } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("id", reco.compensation_plan_id)
      .single();
    commissionPlan = plan;
  }
  if (!commissionPlan) {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    commissionPlan = defaultPlan;
  }

  const steps = ((reco.recommendation_steps ?? []) as unknown as StepRow[]).sort(
    (a, b) => (a.step?.order_index ?? 0) - (b.step?.order_index ?? 0)
  );

  const referrer = Array.isArray(reco.referrer) ? reco.referrer[0] : reco.referrer;
  const professional = Array.isArray(reco.professional) ? reco.professional[0] : reco.professional;

  return (
    <RecoJourneyView
      reco={{
        id: reco.id,
        status: reco.status,
        amount: reco.amount,
        commission_rate: commissionPlan?.commission_rate ?? null,
        high_amount_threshold: commissionPlan?.high_amount_threshold ?? null,
        high_amount_commission_rate: commissionPlan?.high_amount_commission_rate ?? null,
        referrer: referrer ?? null,
        professional: professional ?? null,
      }}
      steps={steps}
      annotations={(annotationsRaw ?? []) as unknown as AnnotationRow[]}
      currentAdminId={user.id}
      onAddAnnotation={addRecoAnnotation}
      onDeleteAnnotation={deleteRecoAnnotation}
      onAdvanceStep={advanceRecommendationStep}
      onToggleStatus={toggleRecommendationStatus}
    />
  );
}
