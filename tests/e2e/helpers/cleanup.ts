import { db, wn } from "./supabase";
import { E2E } from "./env";

/**
 * Supprime tous les comptes E2E (email finissant par @winelio-e2e.local).
 * La suppression Auth ne cascade pas vers winelio.profiles sur l'instance
 * self-hosted : toutes les dépendances et le profil sont donc supprimés
 * explicitement, avec vérification de chaque erreur.
 *
 * Implémentation : on identifie les cibles via winelio.profiles (que l'on contrôle),
 * pas via auth.admin.listUsers() qui plante en environnement self-hosted GoTrue récent.
 *
 * À appeler en début ET en fin de chaque suite pour garantir l'isolation.
 */
export async function cleanupE2EAccounts(): Promise<{ deleted: number }> {
  const ensureSuccess = (
    label: string,
    result: { error: { message: string } | null }
  ) => {
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
  };

  // 1) recensement des id E2E via profiles (filtre par domaine email)
  const { data: profiles, error } = await wn()
    .from("profiles")
    .select("id, email")
    .ilike("email", `%@${E2E.emailDomain}`);
  if (error) throw new Error(`list profiles E2E: ${error.message}`);

  const targets = profiles ?? [];

  // Les contacts E2E ne possèdent pas nécessairement de profil. Leurs emails
  // de validation doivent donc être purgés par domaine, même quand aucun compte
  // Auth E2E ne subsiste.
  ensureSuccess(
    "delete all E2E email queue rows",
    await wn()
      .from("email_queue")
      .delete()
      .ilike("to_email", `%@${E2E.emailDomain}`),
  );
  ensureSuccess(
    "delete all E2E email sent logs",
    await wn()
      .from("email_sent_log")
      .delete()
      .ilike("to_email", `%@${E2E.emailDomain}`),
  );
  ensureSuccess(
    "delete all E2E otp codes",
    await wn()
      .from("otp_codes")
      .delete()
      .ilike("email", `%@${E2E.emailDomain}`),
  );

  if (targets.length === 0) return { deleted: 0 };

  const ids = targets.map((p) => p.id);
  const emails = targets.map((p) => p.email.toLowerCase());

  // 2) purge applicative en amont (FK potentiellement SET NULL)
  // recommendation_followups référence recommendations (FK CASCADE en place
  // mais on purge aussi par sécurité avant de supprimer les recos elles-mêmes).
  const { data: recos } = await wn()
    .from("recommendations")
    .select("id")
    .or(`referrer_id.in.(${ids.join(",")}),professional_id.in.(${ids.join(",")})`);
  const recoIds = (recos ?? []).map((r) => r.id);
  if (recoIds.length) {
    ensureSuccess("delete recommendation_followups", await wn().from("recommendation_followups").delete().in("recommendation_id", recoIds));
    ensureSuccess("delete recommendation_steps", await wn().from("recommendation_steps").delete().in("recommendation_id", recoIds));
    ensureSuccess("delete stripe_payment_sessions", await wn().from("stripe_payment_sessions").delete().in("recommendation_id", recoIds));
    ensureSuccess("delete reviews", await wn().from("reviews").delete().in("recommendation_id", recoIds));
    ensureSuccess("delete recommendation commissions", await wn().from("commission_transactions").delete().in("recommendation_id", recoIds));
  }
  ensureSuccess("delete recommendations by referrer", await wn().from("recommendations").delete().in("referrer_id", ids));
  ensureSuccess("delete recommendations by professional", await wn().from("recommendations").delete().in("professional_id", ids));
  ensureSuccess("delete contacts", await wn().from("contacts").delete().in("user_id", ids));
  ensureSuccess("delete companies", await wn().from("companies").delete().in("owner_id", ids));
  ensureSuccess("delete user commissions", await wn().from("commission_transactions").delete().in("user_id", ids));
  ensureSuccess("delete wallets", await wn().from("user_wallet_summaries").delete().in("user_id", ids));
  ensureSuccess("delete otp codes", await wn().from("otp_codes").delete().in("email", emails));
  ensureSuccess("detach sponsor chain", await wn().from("profiles").update({ sponsor_id: null }).in("id", ids));

  // 3) suppression auth.users (cascade vers profiles via FK ON DELETE CASCADE)
  let deleted = 0;
  for (const id of ids) {
    const { error: delErr } = await db().auth.admin.deleteUser(id);
    if (delErr && !/not found/i.test(delErr.message)) {
      console.warn(`[cleanup] deleteUser ${id} failed: ${delErr.message}, fallback profile delete`);
    }
    ensureSuccess(`delete profile ${id}`, await wn().from("profiles").delete().eq("id", id));
    deleted++;
  }

  const { count: remaining, error: verifyError } = await wn()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("id", ids);
  if (verifyError) throw new Error(`verify cleanup: ${verifyError.message}`);
  if ((remaining ?? 0) > 0) throw new Error(`cleanup incomplet: ${remaining} profil(s) résiduel(s)`);

  return { deleted };
}
