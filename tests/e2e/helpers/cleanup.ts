import { db, wn } from "./supabase";
import { E2E } from "./env";

/**
 * Supprime tous les comptes E2E (email finissant par @winelio-e2e.local).
 * Cascade : profile, companies, contacts, recommendations, commission_transactions, etc.
 * via les FK ON DELETE CASCADE déjà en place.
 *
 * À appeler en début ET en fin de chaque suite pour garantir l'isolation.
 */
export async function cleanupE2EAccounts(): Promise<{ deleted: number }> {
  // 1) recensement des user_id E2E
  const { data: users, error } = await db().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);

  const targets = (users.users ?? []).filter((u) =>
    typeof u.email === "string" && u.email.toLowerCase().endsWith(`@${E2E.emailDomain}`)
  );

  // 2) purge applicative en amont (au cas où certaines FK seraient SET NULL)
  if (targets.length) {
    const ids = targets.map((u) => u.id);
    await wn().from("recommendations").delete().in("referrer_id", ids);
    await wn().from("recommendations").delete().in("professional_id", ids);
    await wn().from("contacts").delete().in("owner_id", ids);
    await wn().from("companies").delete().in("owner_id", ids);
    await wn().from("commission_transactions").delete().in("recipient_id", ids);
    await wn().from("user_wallet_summaries").delete().in("user_id", ids);
    await wn().from("otp_codes").delete().in("email", targets.map((u) => u.email!.toLowerCase()));
    await wn().from("email_queue").delete().in("to_email", targets.map((u) => u.email!));
  }

  // 3) suppression auth.users (cascade vers profiles via FK)
  let deleted = 0;
  for (const u of targets) {
    const { error: delErr } = await db().auth.admin.deleteUser(u.id);
    if (delErr) console.warn(`[cleanup] deleteUser ${u.email} failed: ${delErr.message}`);
    else deleted++;
  }

  return { deleted };
}
