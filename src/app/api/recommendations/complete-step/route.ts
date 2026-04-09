import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { calculateCommissions } from "@/lib/commission";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const { recommendation_id, step_id, quote_amount } = body;

    if (!recommendation_id || !step_id) {
      return NextResponse.json(
        { error: "Paramètres manquants" },
        { status: 400 }
      );
    }

    // Fetch recommendation server-side
    const { data: rec } = await supabase
      .from("recommendations")
      .select("id, status, amount, referrer_id, professional_id, compensation_plan_id")
      .eq("id", recommendation_id)
      .single();

    if (!rec) {
      return NextResponse.json(
        { error: "Recommandation introuvable" },
        { status: 404 }
      );
    }

    // Fetch step to complete
    const { data: stepRow } = await supabase
      .from("recommendation_steps")
      .select(
        "id, completed_at, step:steps(completion_role, order_index)"
      )
      .eq("id", step_id)
      .eq("recommendation_id", recommendation_id)
      .single();

    if (!stepRow) {
      return NextResponse.json(
        { error: "Étape introuvable" },
        { status: 404 }
      );
    }

    if (stepRow.completed_at) {
      return NextResponse.json(
        { error: "Étape déjà complétée" },
        { status: 400 }
      );
    }

    // Validate role authorization server-side
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

    const stepData: Record<string, unknown> = {};
    const stepIndex = step?.order_index ?? 0;
    const isQuoteStep = stepIndex === 5;
    const isValidationStep = stepIndex === 6;

    // Handle quote amount for step 5
    if (isQuoteStep) {
      const amount = parseFloat(quote_amount);
      if (isNaN(amount) || amount <= 0 || amount > 1000000) {
        return NextResponse.json(
          { error: "Montant du devis invalide" },
          { status: 400 }
        );
      }
      stepData.montant = amount;

      await supabase
        .from("recommendations")
        .update({ amount: amount })
        .eq("id", rec.id);
    }

    // Complete the step
    await supabase
      .from("recommendation_steps")
      .update({
        completed_at: new Date().toISOString(),
        data: Object.keys(stepData).length > 0 ? stepData : undefined,
      })
      .eq("id", stepRow.id);

    // If validation step (6), trigger commission creation server-side
    if (isValidationStep && rec.amount) {
      // Garde idempotente : ne crée les commissions que si elles n'existent pas encore
      const { count: existingCommissions } = await supabase
        .from("commission_transactions")
        .select("id", { count: "exact", head: true })
        .eq("recommendation_id", rec.id);

      if (existingCommissions && existingCommissions > 0) {
        // Commissions déjà créées (appel dupliqué) — retourne succès sans rien faire
        return NextResponse.json({ success: true });
      }

      // Récupère le plan depuis la recommandation, ou le plan par défaut
      let planId = rec.compensation_plan_id;
      if (!planId) {
        const { data: defaultPlan } = await supabaseAdmin
          .from("compensation_plans")
          .select("id")
          .eq("is_default", true)
          .eq("is_active", true)
          .single();
        planId = defaultPlan?.id ?? null;
      }

      if (planId) {
        const { data: plan } = await supabaseAdmin
          .from("compensation_plans")
          .select("*")
          .eq("id", planId)
          .single();

        if (plan) {
          const { referrer_commission, level_commissions } =
            calculateCommissions(rec.amount, plan);

          // Insert commission referrer (supabaseAdmin pour bypass RLS)
          await supabaseAdmin.from("commission_transactions").insert({
            recommendation_id: rec.id,
            user_id: rec.referrer_id,
            amount: referrer_commission,
            type: "recommendation",
            level: 0,
            status: "EARNED",
          });

          // Walk sponsor chain server-side
          let currentProfileId = rec.referrer_id;
          for (const lc of level_commissions) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("sponsor_id")
              .eq("id", currentProfileId)
              .single();

            if (!profile?.sponsor_id) break;

            await supabaseAdmin.from("commission_transactions").insert({
              recommendation_id: rec.id,
              user_id: profile.sponsor_id,
              amount: lc.amount,
              type: `referral_level_${lc.level}`,
              level: lc.level,
              status: "EARNED",
            });

            currentProfileId = profile.sponsor_id;
          }
        }
      }
    }

    // Update recommendation status based on completed step
    const STATUS_BY_STEP: Record<number, string> = {
      1: "PENDING",
      2: "ACCEPTED",
      3: "CONTACT_MADE",
      4: "MEETING_SCHEDULED",
      5: "QUOTE_SUBMITTED",
      6: "QUOTE_VALIDATED",
      7: "PAYMENT_RECEIVED",
      8: "COMPLETED",
    };
    const newStatus = STATUS_BY_STEP[stepIndex] ?? rec.status;

    await supabase
      .from("recommendations")
      .update({ status: newStatus })
      .eq("id", rec.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
