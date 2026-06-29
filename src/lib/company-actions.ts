"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { geocodeAddress } from "@/lib/geocode";
import { verifySiren } from "@/lib/siren";
import { checkNafCode } from "@/lib/naf-rules";
import { validateCompanyName, validateCompanyDescription } from "@/lib/company-name-validator";
import { formatDisplayName } from "@/lib/utils";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

async function generateAlias(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const alias = "#" + Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
    const { data } = await supabase.from("companies").select("id").eq("alias", alias).maybeSingle();
    if (!data) return alias;
  }
  throw new Error("Alias generation failed");
}

export async function createCompany(payload: {
  name: string;
  legal_name?: string;
  email: string;
  phone: string;
  website?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  siret?: string;
  siren?: string;
  insurance_number?: string;
  is_verified: boolean;
  category_id: string;
  description?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // Refus URL/téléphone dans le nom commercial et la raison sociale
  const nameCheck = validateCompanyName(payload.name, "nom");
  if (!nameCheck.ok) return { error: nameCheck.error };
  const legalNameCheck = validateCompanyName(payload.legal_name, "nom légal");
  if (!legalNameCheck.ok) return { error: legalNameCheck.error };

  // Validation de la présentation
  if (payload.description) {
    const descCheck = validateCompanyDescription(payload.description);
    if (!descCheck.ok) return { error: descCheck.error };
  }

  // Re-vérification SIREN + NAF côté serveur pour empêcher tout bypass du contrôle client.
  let nafCode: string | null = null;
  if (payload.siret) {
    const sirenData = await verifySiren(payload.siret);
    if (!sirenData) {
      return { error: "SIRET introuvable dans le registre des entreprises." };
    }
    const nafCheck = checkNafCode(sirenData.naf);
    if (!nafCheck.allowed) {
      return { error: nafCheck.reason };
    }
    nafCode = nafCheck.code;
  }

  const insuranceNumber = (payload.insurance_number ?? "").trim().slice(0, 100);
  if (!insuranceNumber) {
    return { error: "Un numéro d'assurance professionnelle est obligatoire." };
  }

  const alias = await generateAlias(supabase);

  const { error } = await supabase.from("companies").insert({
    ...payload,
    naf_code: nafCode,
    insurance_number: insuranceNumber,
    owner_id: user.id,
    source: "owner",
    alias,
  });

  if (error) return { error: error.message };

  // Mettre à jour le profil de l'utilisateur en pro
  const { data: previous } = await supabase
    .from("profiles")
    .select("is_professional")
    .eq("id", user.id)
    .single();

  const wasAlreadyPro = !!previous?.is_professional;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      is_professional: true,
      pro_engagement_accepted: true,
    })
    .eq("id", user.id);

  if (profileError) {
    console.error("Erreur lors de la mise à jour du profil dans createCompany:", profileError);
  }

  // Notifier le parrain direct si première activation pro
  if (!wasAlreadyPro) {
    const { data: category } = await supabase
      .from("categories")
      .select("name")
      .eq("id", payload.category_id)
      .maybeSingle();

    const { notifyNewProInNetwork } = await import("@/lib/notify-new-pro-in-network");
    notifyNewProInNetwork(user.id, {
      categoryName: category?.name ?? null,
      workMode: null,
    }).catch((err) =>
      console.error("[createCompany] Erreur notify-new-pro-in-network:", err)
    );
  }

  if (payload.city || payload.postal_code) {
    const coords = await geocodeAddress(
      payload.address ?? "",
      payload.city ?? "",
      payload.postal_code ?? ""
    );
    if (coords) {
      await supabase.from("profiles").update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        city: payload.city ?? undefined,
        postal_code: payload.postal_code ?? undefined,
      }).eq("id", user.id);
    }
  }

  revalidatePath("/companies");
  return { success: true };
}

/**
 * Édition d'une fiche entreprise par son owner.
 * Les champs verrouillés (siret, siren, naf_code, alias) ne sont jamais modifiables ici —
 * seul le support peut les changer.
 */
export async function updateCompany(
  companyId: string,
  payload: {
    name?: string;
    legal_name?: string;
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    category_id?: string;
    description?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  // Refus URL/téléphone dans le nom commercial et la raison sociale
  if ("name" in payload) {
    const nameCheck = validateCompanyName(payload.name, "nom");
    if (!nameCheck.ok) return { error: nameCheck.error };
  }
  if ("legal_name" in payload) {
    const legalNameCheck = validateCompanyName(payload.legal_name, "nom légal");
    if (!legalNameCheck.ok) return { error: legalNameCheck.error };
  }

  // Validation de la présentation
  if ("description" in payload && payload.description) {
    const descCheck = validateCompanyDescription(payload.description);
    if (!descCheck.ok) return { error: descCheck.error };
  }

  const patch: Record<string, string | null> = {};
  if ("name" in payload) patch.name = (payload.name ?? "").trim().slice(0, 200) || null;
  if ("legal_name" in payload) patch.legal_name = (payload.legal_name ?? "").trim().slice(0, 200) || null;
  if ("email" in payload) patch.email = (payload.email ?? "").trim().slice(0, 254) || null;
  if ("phone" in payload) patch.phone = (payload.phone ?? "").trim().slice(0, 20) || null;
  if ("website" in payload) patch.website = (payload.website ?? "").trim().slice(0, 254) || null;
  if ("address" in payload) patch.address = (payload.address ?? "").trim().slice(0, 200) || null;
  if ("city" in payload) patch.city = (payload.city ?? "").trim().slice(0, 100) || null;
  if ("postal_code" in payload) patch.postal_code = (payload.postal_code ?? "").trim().slice(0, 10) || null;
  if ("category_id" in payload) patch.category_id = payload.category_id || null;
  if ("description" in payload) patch.description = payload.description || null;

  const { error } = await supabase
    .from("companies")
    .update(patch)
    .eq("id", companyId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  if (patch.city || patch.postal_code) {
    const coords = await geocodeAddress(
      patch.address ?? "",
      patch.city ?? "",
      patch.postal_code ?? ""
    );
    if (coords) {
      await supabase.from("profiles").update({
        latitude: coords.latitude,
        longitude: coords.longitude,
        city: patch.city ?? undefined,
        postal_code: patch.postal_code ?? undefined,
      }).eq("id", user.id);
    }
  }

  revalidatePath("/companies");
  revalidatePath(`/companies/${companyId}/edit`);
  return { success: true };
}

/**
 * Envoie au support une demande de modification d'une donnée légale verrouillée
 * (SIRET / SIREN / NAF) sur une fiche entreprise dont le user est owner.
 */
export async function requestCompanyModification(
  companyId: string,
  reason: string
): Promise<{ success?: true; error?: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < 10) {
    return { error: "Merci de préciser la raison (au moins 10 caractères)." };
  }
  if (trimmed.length > 2000) {
    return { error: "Raison trop longue (2000 caractères max)." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, siret, siren, naf_code, insurance_number")
    .eq("id", companyId)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!company) return { error: "Fiche introuvable." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const requesterName =
    formatDisplayName(profile?.first_name, profile?.last_name, user.email || "Utilisateur Winelio");

  const { notifyCompanyModificationRequest } = await import(
    "@/lib/notify-company-modification-request"
  );
  await notifyCompanyModificationRequest({
    requesterEmail: user.email ?? "",
    requesterName,
    companyName: company.name ?? "—",
    companyId: company.id,
    siret: company.siret,
    siren: company.siren,
    nafCode: company.naf_code,
    insuranceNumber: company.insurance_number,
    reason: trimmed,
  });

  return { success: true };
}

export async function deleteCompany(companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

  const { error } = await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", companyId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/companies");
  return { success: true };
}
