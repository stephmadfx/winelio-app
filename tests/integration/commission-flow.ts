import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: "tests/e2e/.env.test", override: true, quiet: true });

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const main = async () => {
  const [{ createTestUser, createTestContact }, { cleanupE2EAccounts }, { e2eEmail }, { wn }, { createCommissions }, { unlockRecommendationCommissions }] =
    await Promise.all([
      import("../e2e/helpers/factories"),
      import("../e2e/helpers/cleanup"),
      import("../e2e/helpers/env"),
      import("../e2e/helpers/supabase"),
      import("../../src/lib/commission"),
      import("../../src/lib/recommendation-review"),
    ]);

  await cleanupE2EAccounts();

  let recommendationId: string | null = null;
  let testError: unknown = null;

  try {
    const root = await createTestUser({ email: e2eEmail("commission-root"), isFounder: true });
    const level5 = await createTestUser({ email: e2eEmail("commission-l5"), sponsorId: root.id });
    const level4 = await createTestUser({ email: e2eEmail("commission-l4"), sponsorId: level5.id });
    const level3 = await createTestUser({ email: e2eEmail("commission-l3"), sponsorId: level4.id });
    const level2 = await createTestUser({ email: e2eEmail("commission-l2"), sponsorId: level3.id });
    const level1 = await createTestUser({ email: e2eEmail("commission-l1"), sponsorId: level2.id });
    const referrer = await createTestUser({ email: e2eEmail("commission-referrer"), sponsorId: level1.id });
    const professional = await createTestUser({
      email: e2eEmail("commission-professional"),
      sponsorId: referrer.id,
      isProfessional: true,
    });
    const contact = await createTestContact({ userId: referrer.id });

    const { data: plan, error: planError } = await wn()
      .from("compensation_plans")
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();
    if (planError || !plan) throw new Error(`Plan de commission introuvable: ${planError?.message}`);

    const { data: recommendation, error: recommendationError } = await wn()
      .from("recommendations")
      .insert({
        referrer_id: referrer.id,
        professional_id: professional.id,
        contact_id: contact.id,
        compensation_plan_id: plan.id,
        project_description: "Test intégration commissions",
        urgency_level: "normal",
        status: "COMPLETED",
        amount: 1000,
        is_demo: true,
      })
      .select("id")
      .single();
    if (recommendationError || !recommendation) {
      throw new Error(`Création recommandation impossible: ${recommendationError?.message}`);
    }
    recommendationId = recommendation.id;

    await createCommissions(
      recommendation.id,
      referrer.id,
      professional.id,
      1000,
      plan.id
    );

    const { data: pending, error: pendingError } = await wn()
      .from("commission_transactions")
      .select("type, amount, status, is_demo")
      .eq("recommendation_id", recommendation.id);
    if (pendingError) throw new Error(`Lecture commissions impossible: ${pendingError.message}`);

    assert(pending?.length === 9, `9 commissions attendues, reçu ${pending?.length ?? 0}`);
    assert(pending.every((row) => row.status === "PENDING"), "Toutes les commissions doivent démarrer PENDING");
    assert(pending.every((row) => row.is_demo === true), "Une commission de test a fui hors du périmètre démo");
    const total = pending.reduce((sum, row) => sum + Number(row.amount), 0);
    assert(Math.abs(total - 100) < 0.01, `Ventilation attendue 100 €, reçue ${total} €`);

    const { count: leakedBeforePayment, error: leakError } = await wn()
      .from("commissions_real")
      .select("id", { count: "exact", head: true })
      .eq("recommendation_id", recommendation.id);
    if (leakError) throw new Error(`Contrôle de fuite impossible: ${leakError.message}`);
    assert(leakedBeforePayment === 0, "Les commissions E2E apparaissent dans commissions_real");

    const { error: paymentError } = await wn().from("stripe_payment_sessions").insert({
      recommendation_id: recommendation.id,
      stripe_session_id: `cs_test_integration_${crypto.randomUUID().replaceAll("-", "")}`,
      amount: 100,
      status: "paid",
      paid_at: new Date().toISOString(),
    });
    if (paymentError) throw new Error(`Création paiement simulé impossible: ${paymentError.message}`);

    const payout = await unlockRecommendationCommissions(recommendation.id);
    assert(payout.paid, "Le paiement simulé n'a pas été reconnu");
    assert(!payout.reviewed, "Aucun avis ne devait être présent");
    assert(payout.unlocked === 8, `8 commissions devaient être débloquées, reçu ${payout.unlocked}`);

    const { data: earned, error: earnedError } = await wn()
      .from("commission_transactions")
      .select("type, status")
      .eq("recommendation_id", recommendation.id);
    if (earnedError) throw new Error(`Contrôle post-paiement impossible: ${earnedError.message}`);
    assert(
      earned.filter((row) => row.status === "EARNED").length === 8,
      "Les commissions réseau, plateforme, affiliation et cashback doivent être EARNED"
    );
    assert(
      earned.find((row) => row.type === "recommendation")?.status === "PENDING",
      "La commission directe doit rester PENDING jusqu'à l'avis"
    );
  } catch (error) {
    testError = error;
  } finally {
    await cleanupE2EAccounts();
  }

  const { count: residualProfiles } = await wn()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .ilike("email", "%@winelio-e2e.local");
  assert(residualProfiles === 0, `${residualProfiles ?? "?"} profil(s) E2E résiduel(s)`);

  if (recommendationId) {
    const { count: residualRecommendations } = await wn()
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("id", recommendationId);
    assert(residualRecommendations === 0, "La recommandation d'intégration n'a pas été nettoyée");
  }

  if (testError) throw testError;
  console.log("Commission integration: OK — ventilation, déblocage, isolation démo et nettoyage vérifiés");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
