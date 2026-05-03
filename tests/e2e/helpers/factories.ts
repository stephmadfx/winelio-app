import { db, wn } from "./supabase";

export type TestUser = {
  id: string;
  email: string;
  sponsorCode: string;
};

/**
 * Crée un compte test (auth.users + profil winelio) via supabase-admin.
 * Le trigger `on_auth_user_created` crée la ligne profiles ; on la met à jour ensuite.
 *
 * Tous les comptes sont marqués `is_demo = true` pour apparaître avec le badge démo
 * dans l'UI (ils n'apparaissent pas comme des "vrais" users).
 */
export async function createTestUser(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  sponsorId?: string | null;
  isProfessional?: boolean;
  isFounder?: boolean;
  termsAccepted?: boolean;
}): Promise<TestUser> {
  const { data: auth, error: authErr } = await db().auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    user_metadata: { first_name: opts.firstName ?? "E2E", last_name: opts.lastName ?? "Test" },
  });
  if (authErr || !auth.user) throw new Error(`createUser ${opts.email}: ${authErr?.message}`);

  const userId = auth.user.id;

  const { error: updErr } = await wn()
    .from("profiles")
    .update({
      first_name:       opts.firstName ?? "E2E",
      last_name:        opts.lastName ?? "Test",
      sponsor_id:       opts.sponsorId ?? null,
      is_professional:  opts.isProfessional ?? false,
      is_founder:       opts.isFounder ?? false,
      is_demo:          true,
      terms_accepted:   opts.termsAccepted ?? true,
      terms_accepted_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (updErr) throw new Error(`update profile ${opts.email}: ${updErr.message}`);

  const { data: prof, error: selErr } = await wn()
    .from("profiles")
    .select("sponsor_code")
    .eq("id", userId)
    .single();
  if (selErr || !prof) throw new Error(`fetch sponsor_code ${opts.email}: ${selErr?.message}`);

  return { id: userId, email: opts.email, sponsorCode: prof.sponsor_code };
}

/**
 * Crée une company pour un pro. Retourne l'id et l'alias auto-généré si présent.
 */
export async function createTestCompany(opts: {
  ownerId: string;
  name: string;
  categoryId: string;
  email?: string | null;
  source?: "owner" | "scraped";
}): Promise<{ id: string }> {
  const { data, error } = await wn()
    .from("companies")
    .insert({
      owner_id:    opts.ownerId,
      name:        opts.name,
      category_id: opts.categoryId,
      email:       opts.email ?? null,
      source:      opts.source ?? "owner",
      is_verified: true,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createCompany: ${error?.message}`);
  return { id: data.id };
}

/**
 * Crée un contact (prospect) appartenant à un referrer.
 */
export async function createTestContact(opts: {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}): Promise<{ id: string }> {
  const { data, error } = await wn()
    .from("contacts")
    .insert({
      user_id:    opts.userId,
      first_name: opts.firstName ?? "Clément",
      last_name:  opts.lastName  ?? "Test",
      email:      opts.email     ?? `contact-${Math.random().toString(36).slice(2, 8)}@winelio-e2e.local`,
      phone:      opts.phone     ?? null,
      country:    "FR",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createContact: ${error?.message}`);
  return { id: data.id };
}

/**
 * Récupère une catégorie au hasard (par défaut "Plomberie" si présente, sinon la première).
 */
export async function pickCategory(name = "Plomberie"): Promise<string> {
  const { data, error } = await wn()
    .from("categories")
    .select("id, name")
    .order("name");
  if (error || !data?.length) throw new Error(`pickCategory: ${error?.message}`);
  return (data.find((c) => c.name === name) ?? data[0]).id;
}
