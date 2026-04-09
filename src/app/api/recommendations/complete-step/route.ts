import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCommissions } from "@/lib/commission";
import { RECOMMENDATION_STATUS } from "@/lib/constants";

const STATUS_BY_STEP: Record<number, string> = {
  1: RECOMMENDATION_STATUS.PENDING,
  2: RECOMMENDATION_STATUS.ACCEPTED,
  3: RECOMMENDATION_STATUS.CONTACT_MADE,
  4: RECOMMENDATION_STATUS.MEETING_SCHEDULED,
  5: RECOMMENDATION_STATUS.QUOTE_SUBMITTED,
  6: RECOMMENDATION_STATUS.QUOTE_VALIDATED,
  7: RECOMMENDATION_STATUS.PAYMENT_RECEIVED,
  8: RECOMMENDATION_STATUS.COMPLETED,
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { recommendation_id, step_id, quote_amount } = body;

    if (!recommendation_id || !step_id) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const { data: rec } = await supabase
      .from("recommendations")
      .select("id, status, amount, referrer_id, professional_id, compensation_plan_id")
      .eq("id", recommendation_id)
      .single();

    if (!rec) {
      return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
    }

    const { data: stepRow } = await supabase
      .from("recommendation_steps")
      .select("id, completed_at, step:steps(completion_role, order_index)")
      .eq("id", step_id)
      .eq("recommendation_id", recommendation_id)
      .single();

    if (!stepRow) {
      return NextResponse.json({ error: "Étape introuvable" }, { status: 404 });
    }

    if (stepRow.completed_at) {
      return NextResponse.json({ error: "Étape déjà complétée" }, { status: 400 });
    }

    // Vérification des droits par rôle
    const step = Array.isArray(stepRow.step) ? stepRow.step[0] : stepRow.step;
    const role = step?.completion_role;
    if (role === "REFERRER" && user.id !== rec.referrer_id) {
      return NextResponse.json(
        { error: "Non autorisé : seul le recommandeur peut valider cette étape" },
        { status: 403 }
      );
    }
    if (role === "PROFESSIONAL" && user.id !== rec.professional_id) {
      return NextResponse.json(
        { error: "Non autorisé : seul le professionnel peut valider cette étape" },
        { status: 403 }
      );
    }

    const stepIndex = step?.order_index ?? 0;
    const stepData: Record<string, unknown> = {};

    // Étape 5 : enregistrer le montant du devis
    if (stepIndex === 5) {
      const amount = parseFloat(quote_amount);
      if (isNaN(amount) || amount <= 0 || amount > 1000000) {
        return NextResponse.json({ error: "Montant du devis invalide" }, { status: 400 });
      }
      stepData.montant = amount;
      await supabase
        .from("recommendations")
        .update({ amount })
        .eq("id", rec.id);
    }

    // Marquer l'étape comme complétée
    await supabase
      .from("recommendation_steps")
      .update({
        completed_at: new Date().toISOString(),
        data: Object.keys(stepData).length > 0 ? stepData : undefined,
      })
      .eq("id", stepRow.id);

    // Étape 6 : déclencher les commissions MLM
    // createCommissions est idempotente et utilise supabaseAdmin (bypass RLS)
    // Le trigger DB `on_commission_change` met à jour user_wallet_summaries automatiquement
    if (stepIndex === 6 && rec.amount) {
      await createCommissions(
        rec.id,
        rec.referrer_id,
        rec.amount,
        rec.compensation_plan_id ?? null
      );
    }

    // Mettre à jour le statut de la recommandation
    const newStatus = STATUS_BY_STEP[stepIndex] ?? rec.status;
    await supabase
      .from("recommendations")
      .update({ status: newStatus })
      .eq("id", rec.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
