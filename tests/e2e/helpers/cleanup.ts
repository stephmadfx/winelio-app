import { db, wn } from "./supabase";
import { E2E } from "./env";

/**
 * Supprime tous les comptes E2E (email finissant par @winelio-e2e.local).
 * Cascade : profile, companies, contacts, recommendations, commission_transactions, etc.
 * via les FK ON DELETE CASCADE déjà en place.
 *
 * Implémentation : on identifie les cibles via winelio.profiles (que l'on contrôle),
 * pas via auth.admin.listUsers() qui plante en environnement self-hosted GoTrue récent.
 *
 * À appeler en début ET en fin de chaque suite pour garantir l'isolation.
 */
export async function cleanupE2EAccounts(): Promise<{ deleted: number }> {
  // 1) recensement des id E2E via profiles (filtre par domaine email)
  const { data: profiles, error } = await wn()
    .from("profiles")
    .select("id, email")
    .ilike("email", `%@${E2E.emailDomain}`);
  if (error) throw new Error(`list profiles E2E: ${error.message}`);

  const targets = profiles ?? [];
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
    await wn().from("recommendation_followups").delete().in("recommendation_id", recoIds);
    await wn().from("recommendation_steps").delete().in("recommendation_id", recoIds);
  }
  await wn().from("recommendations").delete().in("referrer_id", ids);
  await wn().from("recommendations").delete().in("professional_id", ids);
  await wn().from("contacts").delete().in("user_id", ids);
  await wn().from("companies").delete().in("owner_id", ids);
  await wn().from("commission_transactions").delete().in("user_id", ids);
  await wn().from("user_wallet_summaries").delete().in("user_id", ids);
  await wn().from("otp_codes").delete().in("email", emails);
  await wn().from("email_queue").delete().in("to_email", targets.map((p) => p.email));

  // 3) suppression auth.users (cascade vers profiles via FK ON DELETE CASCADE)
  let deleted = 0;
  for (const id of ids) {
    const { error: delErr } = await db().auth.admin.deleteUser(id);
    if (delErr) {
      // fallback : suppression directe du profil si l'API admin échoue
      console.warn(`[cleanup] deleteUser ${id} failed: ${delErr.message}, fallback profile delete`);
      await wn().from("profiles").delete().eq("id", id);
    }
    deleted++;
  }

  return { deleted };
}
