import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { advanceRecommendationStep, toggleRecommendationStatus } from "../../actions";
import { addRecoAnnotation, deleteRecoAnnotation } from "./actions";
import { RecoJourneyView, type AnnotationRow, type StepRow } from "@/components/admin/RecoJourneyView";

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

  // Résoudre le commission_rate depuis le plan ou plan par défaut
  let commissionRate: number | null = null;
  if (reco.compensation_plan_id) {
    const { data: plan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("id", reco.compensation_plan_id)
      .single();
    commissionRate = plan?.commission_rate ?? null;
  }
  if (commissionRate === null) {
    const { data: defaultPlan } = await supabaseAdmin
      .from("compensation_plans")
      .select("commission_rate")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    commissionRate = defaultPlan?.commission_rate ?? null;
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
        commission_rate: commissionRate,
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
