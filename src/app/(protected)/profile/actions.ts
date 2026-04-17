"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuditContext, getDocumentHash, logOnboardingEvent } from "@/lib/audit";

const POSTAL_CODE_RE = /^\d{5}$/;
const PHONE_RE = /^[+\d\s()\-]{6,20}$/;

/**
 * Mise à jour du profil avec validation server-side.
 */
export async function updateProfile(data: {
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  is_professional?: boolean;
}): Promise<{ error?: string; firstCompletion?: boolean }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  // Sanitize & validate
  const patch: Record<string, string | boolean | null> = {};

  if ("first_name" in data) {
    const v = (data.first_name ?? "").trim().slice(0, 100);
    patch.first_name = v || null;
  }
  if ("last_name" in data) {
    const v = (data.last_name ?? "").trim().slice(0, 100);
    patch.last_name = v || null;
  }
  if ("phone" in data) {
    const v = (data.phone ?? "").trim().slice(0, 20);
    if (v && !PHONE_RE.test(v)) return { error: "Numéro de téléphone invalide." };
    patch.phone = v || null;
  }
  if ("postal_code" in data) {
    const v = (data.postal_code ?? "").trim();
    if (v && !POSTAL_CODE_RE.test(v)) return { error: "Code postal invalide (5 chiffres)." };
    patch.postal_code = v || null;
  }
  if ("city" in data) {
    const v = (data.city ?? "").trim().slice(0, 100);
    patch.city = v || null;
  }
  if ("address" in data) {
    const v = (data.address ?? "").trim().slice(0, 200);
    patch.address = v || null;
  }
  if ("is_professional" in data) {
    patch.is_professional = !!data.is_professional;
  }

  const supabase = await createClient();

  // Lire le profil AVANT update pour détecter la première complétion
  const { data: before } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const wasIncomplete = !before?.first_name || !before?.last_name;
  const willBeComplete =
    (patch.first_name ?? before?.first_name) &&
    (patch.last_name  ?? before?.last_name);

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);

  if (error) return { error: "Erreur lors de la sauvegarde." };

  // Le seed démo ne se déclenche que pour les comptes créés après le déploiement
  // de la fonctionnalité (2026-04-12). Les anciens comptes qui complètent leur
  // profil en retard ne doivent pas recevoir de réseau démo.
  const DEMO_SEED_LAUNCH = new Date("2026-04-12T00:00:00Z");
  const accountCreatedAt = user.created_at ? new Date(user.created_at) : null;
  const isNewAccount = accountCreatedAt !== null && accountCreatedAt >= DEMO_SEED_LAUNCH;

  const firstCompletion = !!(wasIncomplete && willBeComplete && isNewAccount);
  return { firstCompletion };
}

/**
 * Assigne un parrain à l'utilisateur courant.
 * Règle MLM : impossible si un sponsor_id est déjà défini.
 */
export async function assignSponsor(sponsorCode: string): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const supabase = await createClient();

  // Vérifie que l'utilisateur n'a pas déjà un parrain
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("sponsor_id")
    .eq("id", user.id)
    .single();

  if (currentProfile?.sponsor_id) {
    return { error: "Vous avez déjà un parrain, cette relation est permanente." };
  }

  const trimmed = sponsorCode.trim().toLowerCase();

  // Vérifie que le code n'est pas dans les codes supprimés
  const { data: deleted } = await supabase
    .from("deleted_sponsor_codes")
    .select("code")
    .eq("code", trimmed)
    .maybeSingle();

  if (deleted) return { error: "Ce code parrain n'est plus disponible." };

  // Trouve le sponsor
  const { data: sponsor } = await supabase
    .from("profiles")
    .select("id")
    .eq("sponsor_code", trimmed)
    .single();

  if (!sponsor) return { error: "Code parrain invalide." };

  const { error } = await supabase
    .from("profiles")
    .update({ sponsor_id: sponsor.id })
    .eq("id", user.id);

  if (error) return { error: "Erreur lors de l'ajout du parrain." };

  return {};
}

/**
 * Finalise l'onboarding Pro :
 * 1. Met à jour profiles (is_professional, work_mode, pro_engagement_accepted)
 * 2. Crée ou met à jour la company principale (siret, category_id)
 * 3. Envoie un email de confirmation au pro
 */
export async function completeProOnboarding(data: {
  work_mode: "remote" | "onsite" | "both";
  category_id: string;
  siret: string | null;
  verified?: {
    siren: string;
    legal_name: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
  } | null;
}): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const supabase = await createClient();
  const { ip, userAgent } = await getAuditContext();

  // 1. Mettre à jour le profil
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      is_professional: true,
      work_mode: data.work_mode,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  if (profileError) return { error: "Erreur lors de la mise à jour du profil." };

  // 2. Récupérer le profil (nom + catégorie pour l'email)
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const fallbackName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Mon entreprise";

  // 3. Vérifier/créer la company
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const verifiedPatch: Record<string, string | boolean | null> = {};
  if (data.verified) {
    verifiedPatch.siren = data.verified.siren;
    verifiedPatch.is_verified = true;
    if (data.verified.legal_name) verifiedPatch.legal_name = data.verified.legal_name;
    if (data.verified.address) verifiedPatch.address = data.verified.address;
    if (data.verified.city) verifiedPatch.city = data.verified.city;
    if (data.verified.postal_code) verifiedPatch.postal_code = data.verified.postal_code;
  }

  if (existingCompany) {
    const patch: Record<string, string | boolean | null> = { ...verifiedPatch };
    if (data.category_id) patch.category_id = data.category_id;
    if (data.siret !== null) patch.siret = data.siret;
    if (Object.keys(patch).length > 0) {
      const { error: companyError } = await supabase
        .from("companies")
        .update(patch)
        .eq("id", existingCompany.id);
      if (companyError) return { error: "Erreur lors de la mise à jour de l'entreprise." };
    }
  } else {
    const { generateUniqueAlias } = await import("@/lib/generate-alias");
    const alias = await generateUniqueAlias(supabase);
    const { error: companyError } = await supabase.from("companies").insert({
      owner_id: user.id,
      name: data.verified?.legal_name || fallbackName,
      category_id: data.category_id || null,
      siret: data.siret || null,
      alias,
      ...verifiedPatch,
    });
    if (companyError) return { error: "Erreur lors de la création de l'entreprise." };
  }

  // 4. Email de confirmation (non bloquant)
  if (user.email) {
    const { data: category } = await supabase
      .from("categories")
      .select("name")
      .eq("id", data.category_id)
      .maybeSingle();
    const firstName = profile?.first_name || profile?.last_name || "Professionnel";
    const { notifyProOnboarding } = await import("@/lib/notify-pro-onboarding");
    notifyProOnboarding({
      email: user.email,
      firstName,
      workMode: data.work_mode,
      categoryName: category?.name || "—",
    }).catch((err) => console.error("notify-pro-onboarding error:", err));

    // Si pas de SIRET : rappel automatique dans 15 jours
    if (!data.siret) {
      const { notifySiretReminder } = await import("@/lib/notify-siret-reminder");
      notifySiretReminder({ email: user.email, firstName })
        .catch((err) => console.error("notify-siret-reminder error:", err));
    }
  }

  // 5. Audit trail
  const base = { userId: user.id, ip, userAgent };

  // Chercher le document CGU Professionnels pour le hash
  const { data: cguDoc } = await supabaseAdmin
    .from("legal_documents")
    .select("id")
    .eq("title", "CGU Professionnels")
    .eq("version", "1.0")
    .maybeSingle();

  const docHashData = cguDoc ? await getDocumentHash(cguDoc.id) : null;

  await logOnboardingEvent({
    ...base,
    eventType: "category_set",
    metadata: { category_id: data.category_id },
  });

  if (data.siret) {
    await logOnboardingEvent({
      ...base,
      eventType: "siret_provided",
      metadata: { siret: data.siret },
    });
  }

  await logOnboardingEvent({ ...base, eventType: "engagement_accepted" });

  await logOnboardingEvent({
    ...base,
    eventType: "cgu_accepted",
    documentId: cguDoc?.id,
    documentVersion: docHashData?.version ?? undefined,
    documentHash: docHashData?.hash ?? undefined,
  });

  await logOnboardingEvent({ ...base, eventType: "pro_activated" });

  return {};
}
