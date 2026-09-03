import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOMMENDATION_STATUS_BY_STEP } from "@/lib/constants";
import { notifyReferrerStep } from "@/lib/notify-referrer-step";
import { notifyContactAccepted } from "@/lib/notify-contact-accepted";
import { requestClientRecommendationAction } from "@/lib/notify-client-recommendation-action";
import { collectCommissionAutomatically } from "@/lib/stripe-automatic-commission";

// Les étapes client (6 et 8) ne passent pas par cette route : elles sont
// confirmées via /api/recommendations/client-action avec un lien signé.

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

    // Vérification des droits par rôle
    const step = Array.isArray(stepRow.step) ? stepRow.step[0] : stepRow.step;
    const role = step?.completion_role;
    const stepIndex = step?.order_index ?? 0;

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
    if (role === "CONTACT") {
      return NextResponse.json(
        { error: "Cette étape doit être confirmée par le client via son lien sécurisé" },
        { status: 403 }
      );
    }
    if (role !== "REFERRER" && role !== "PROFESSIONAL") {
      return NextResponse.json(
        { error: "Rôle de validation non reconnu" },
        { status: 403 }
      );
    }

    // Ne jamais permettre de sauter une étape en appelant directement l'API.
    const { data: allSteps, error: allStepsError } = await supabase
      .from("recommendation_steps")
      .select("completed_at, step:steps(order_index)")
      .eq("recommendation_id", recommendation_id);
    if (allStepsError) {
      return NextResponse.json({ error: "Impossible de vérifier le parcours" }, { status: 500 });
    }
    const hasIncompletePreviousStep = (allSteps ?? []).some((row) => {
      const rowStep = Array.isArray(row.step) ? row.step[0] : row.step;
      return (rowStep?.order_index ?? 0) < stepIndex && !row.completed_at;
    });
    if (hasIncompletePreviousStep) {
      return NextResponse.json(
        { error: "Les étapes précédentes doivent être terminées" },
        { status: 409 }
      );
    }

    if (stepRow.completed_at) {
      if (stepIndex === 5) {
        await requestClientRecommendationAction(rec.id, "quote");
      }
      if (stepIndex === 7) {
        await collectCommissionAutomatically(rec.id);
        await requestClientRecommendationAction(rec.id, "completion");
      }
      await notifyReferrerStep(rec.id, stepIndex);
      if (stepIndex === 2) {
        await notifyContactAccepted(rec.id);
      }
      return NextResponse.json({ success: true, already_completed: true });
    }

    const stepData: Record<string, unknown> = {};

    // Étape 5 : enregistrer le montant du devis. La date de fin est facultative :
    // elle sert uniquement à programmer une relance, jamais à bloquer le parcours.
    if (stepIndex === 5) {
      const amount = parseFloat(quote_amount);
      if (isNaN(amount) || amount <= 0 || amount > 1000000) {
        return NextResponse.json({ error: "Montant du devis invalide" }, { status: 400 });
      }

      const expectedCompletionRaw = body.expected_completion_at;
      const workAlreadyCompleted = body.work_already_completed === true;
      let expectedDate: Date | null = null;
      if (expectedCompletionRaw && !workAlreadyCompleted) {
        expectedDate = new Date(expectedCompletionRaw);
        const nowMs = Date.now();
        if (
          isNaN(expectedDate.getTime()) ||
          expectedDate.getTime() < nowMs + 24 * 60 * 60 * 1000 ||
          expectedDate.getTime() > nowMs + 2 * 365 * 24 * 60 * 60 * 1000
        ) {
          return NextResponse.json(
            { error: "Date prévue invalide (entre +1 jour et +2 ans)" },
            { status: 400 }
          );
        }
      }

      stepData.montant = amount;
      if (expectedDate) {
        stepData.date_prevue = expectedDate.toLocaleDateString("fr-FR");
      }
      if (workAlreadyCompleted) {
        stepData.travaux_deja_termines = true;
      }

      // IMPORTANT : update expected_completion_at AVANT de marquer l'étape complétée,
      // sinon le trigger SQL ne lit pas la valeur correcte.
      const { error: amountError } = await supabase
        .from("recommendations")
        .update({
          amount,
          expected_completion_at: expectedDate?.toISOString() ?? null,
        })
        .eq("id", rec.id);
      if (amountError) {
        return NextResponse.json({ error: "Impossible d'enregistrer le devis" }, { status: 500 });
      }
    }

    // Marquer l'étape comme complétée
    const { error: stepError } = await supabase
      .from("recommendation_steps")
      .update({
        completed_at: new Date().toISOString(),
        data: Object.keys(stepData).length > 0 ? stepData : undefined,
      })
      .eq("id", stepRow.id);
    if (stepError) {
      return NextResponse.json({ error: "Impossible de valider l'étape" }, { status: 500 });
    }

    // Mettre à jour le statut de la recommandation
    const newStatus = RECOMMENDATION_STATUS_BY_STEP[stepIndex] ?? rec.status;
    const { error: statusError } = await supabase
      .from("recommendations")
      .update({ status: newStatus })
      .eq("id", rec.id);
    if (statusError) {
      return NextResponse.json({ error: "Impossible de mettre à jour le statut" }, { status: 500 });
    }

    if (stepIndex === 5) {
      await requestClientRecommendationAction(rec.id, "quote");
    }
    if (stepIndex === 7) {
      await collectCommissionAutomatically(rec.id);
      await requestClientRecommendationAction(rec.id, "completion");
    }

    // Notifier le referrer à chaque avancement pro. L'enfilement est attendu:
    // l'etape ne doit plus passer silencieusement si la notification critique echoue.
    await notifyReferrerStep(rec.id, stepIndex);

    // Étape 2 : prévenir aussi le client que le pro a accepté et va le contacter.
    if (stepIndex === 2) {
      await notifyContactAccepted(rec.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[complete-step] error:", err);
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
