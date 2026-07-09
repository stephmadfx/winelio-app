import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { RECOMMENDATION_STATUS } from "@/lib/constants";
import { notifyReferrerStep } from "@/lib/notify-referrer-step";
import { notifyContactAccepted } from "@/lib/notify-contact-accepted";
import { createStripeCheckoutSession } from "@/lib/stripe-checkout";

// Étape 8 = "Affaire terminée" → email Stripe Checkout pour la commission pro.
// Les commissions MLM sont créées uniquement par le webhook Stripe après paiement.
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

    if (stepRow.completed_at) {
      if (stepIndex === 8) {
        await createStripeCheckoutSession(rec.id);
      }
      await notifyReferrerStep(rec.id, stepIndex);
      if (stepIndex === 2) {
        await notifyContactAccepted(rec.id);
      }
      return NextResponse.json({ success: true, already_completed: true });
    }

    const stepData: Record<string, unknown> = {};

    // Étape 5 : enregistrer le montant du devis + date prévue de fin de travaux
    if (stepIndex === 5) {
      const amount = parseFloat(quote_amount);
      if (isNaN(amount) || amount <= 0 || amount > 1000000) {
        return NextResponse.json({ error: "Montant du devis invalide" }, { status: 400 });
      }

      const expectedCompletionRaw = body.expected_completion_at;
      if (!expectedCompletionRaw) {
        return NextResponse.json(
          { error: "Date prévue de fin des travaux obligatoire" },
          { status: 400 }
        );
      }
      const expectedDate = new Date(expectedCompletionRaw);
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

      stepData.montant = amount;
      stepData.date_prevue = expectedDate.toLocaleDateString("fr-FR");

      // IMPORTANT : update expected_completion_at AVANT de marquer l'étape complétée,
      // sinon le trigger SQL ne lit pas la valeur correcte.
      await supabase
        .from("recommendations")
        .update({ amount, expected_completion_at: expectedDate.toISOString() })
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

    // Mettre à jour le statut de la recommandation
    const newStatus = STATUS_BY_STEP[stepIndex] ?? rec.status;
    await supabase
      .from("recommendations")
      .update({ status: newStatus })
      .eq("id", rec.id);

    if (stepIndex === 8) {
      await createStripeCheckoutSession(rec.id);
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
