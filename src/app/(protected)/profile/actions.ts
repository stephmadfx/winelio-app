"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuditContext, getDocumentHash, logOnboardingEvent } from "@/lib/audit";
import { isAtLeastAge } from "@/lib/age";
import { notifyNewReferral } from "@/lib/notify-new-referral";
import { verifySiren } from "@/lib/siren";
import { checkNafCode } from "@/lib/naf-rules";

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
  birth_date?: string;
  terms_accepted?: boolean;
  is_professional?: boolean;
  avatar?: string | null;
  avatar_visible_to_network?: boolean;
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
  if ("birth_date" in data) {
    const v = (data.birth_date ?? "").trim();
    if (v) {
      if (!isAtLeastAge(v)) {
        return { error: "Vous devez avoir au moins 18 ans pour utiliser Winelio." };
      }
      patch.birth_date = v;
    } else {
      patch.birth_date = null;
    }
  }
  if ("terms_accepted" in data) {
    const accepted = !!data.terms_accepted;
    patch.terms_accepted = accepted;
    patch.terms_accepted_at = accepted ? new Date().toISOString() : null;
  }
  if ("is_professional" in data) {
    patch.is_professional = !!data.is_professional;
  }
  if ("avatar" in data) {
    const v = typeof data.avatar === "string" ? data.avatar.trim().slice(0, 512) : null;
    patch.avatar = v || null;
  }
  if ("avatar_visible_to_network" in data) {
    patch.avatar_visible_to_network = !!data.avatar_visible_to_network;
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

  // Envoyer l'email au parrain UNIQUEMENT à la première complétion,
  // pas au moment de l'inscription (un user peut abandonner entre les deux).
  if (firstCompletion) {
    notifyNewReferral(user.id).catch((err) =>
      console.error("notify-new-referral error:", err)
    );
  }

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Met à jour l'email professionnel de la company principale de l'utilisateur.
 */
export async function updateCompanyEmail(email: string | null): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  const val = (email ?? "").trim().slice(0, 254) || null;
  if (val && !EMAIL_RE.test(val)) return { error: "Adresse email invalide." };

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!company) return { error: "Aucune fiche professionnelle trouvée." };

  const { error } = await supabase
    .from("companies")
    .update({ email: val })
    .eq("id", company.id);

  if (error) return { error: "Erreur lors de la sauvegarde." };
  return {};
}

/**
 * Finalise l'onboarding Pro :
 * 1. Met à jour profiles (is_professional, work_mode, pro_engagement_accepted)
 * 2. Crée ou met à jour la company principale (siret, category_id, email)
 * 3. Envoie un email de confirmation au pro
 */
export async function completeProOnboarding(data: {
  work_mode: "remote" | "onsite" | "both";
  category_id: string;
  siret: string | null;
  email?: string | null;
  insurance_number?: string | null;
}): Promise<{ error?: string }> {
  const user = await getUser();
  if (!user) return { error: "Non authentifié" };

  if (!data.siret) {
    return { error: "Un numéro SIRET est obligatoire pour activer un compte professionnel." };
  }
  const insuranceNumber = (data.insurance_number ?? "").trim().slice(0, 100);
  if (!insuranceNumber) {
    return { error: "Un numéro d'assurance professionnelle est obligatoire pour activer un compte pro." };
  }

  // Vérification SIREN + NAF côté serveur (empêche tout bypass du contrôle client).
  const sirenData = await verifySiren(data.siret);
  if (!sirenData) {
    return { error: "SIRET introuvable dans le registre des entreprises." };
  }
  const nafCheck = checkNafCode(sirenData.naf);
  if (!nafCheck.allowed) {
    return { error: nafCheck.reason };
  }
  const verifiedNafCode = nafCheck.code;
  const verifiedSiren = sirenData.siren;

  const supabase = await createClient();
  const { ip, userAgent } = await getAuditContext();

  // Lire l'état actuel pour ne notifier le parrain qu'à la première activation pro
  const { data: previous } = await supabase
    .from("profiles")
    .select("is_professional")
    .eq("id", user.id)
    .single();
  const wasAlreadyPro = !!previous?.is_professional;

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

  const proEmail = (data.email ?? "").trim().slice(0, 254) || null;

  if (existingCompany) {
    const patch: Record<string, string | null> = {};
    if (data.category_id) patch.category_id = data.category_id;
    if (data.siret !== null) patch.siret = data.siret;
    patch.siren = verifiedSiren;
    patch.naf_code = verifiedNafCode;
    if (proEmail !== null) patch.email = proEmail;
    patch.insurance_number = insuranceNumber;
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
      name: fallbackName,
      category_id: data.category_id || null,
      siret: data.siret || null,
      siren: verifiedSiren,
      naf_code: verifiedNafCode,
      insurance_number: insuranceNumber,
      email: proEmail,
      alias,
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
    const { notifyProOnboarding } = await import("@/lib/notify-pro-onboarding");
    notifyProOnboarding({
      email: user.email,
      firstName: profile?.first_name || profile?.last_name || "Professionnel",
      workMode: data.work_mode,
      categoryName: category?.name || "—",
    }).catch((err) => console.error("notify-pro-onboarding error:", err));

    // Notifier le parrain niveau 1 uniquement à la 1re activation pro
    if (!wasAlreadyPro) {
      const { data: category2 } = await supabase
        .from("categories")
        .select("name")
        .eq("id", data.category_id)
        .maybeSingle();
      const { notifyNewProInNetwork } = await import("@/lib/notify-new-pro-in-network");
      notifyNewProInNetwork(user.id, {
        categoryName: category2?.name ?? null,
        workMode: data.work_mode,
      }).catch((err) => console.error("notify-new-pro-in-network error:", err));
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
