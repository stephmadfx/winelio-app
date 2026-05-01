"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { geocodeAddress } from "@/lib/geocode";
import { verifySiren } from "@/lib/siren";
import { checkNafCode } from "@/lib/naf-rules";

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
  is_verified: boolean;
  category_id: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

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

  const alias = await generateAlias(supabase);

  const { error } = await supabase.from("companies").insert({
    ...payload,
    naf_code: nafCode,
    owner_id: user.id,
    source: "owner",
    alias,
  });

  if (error) return { error: error.message };

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
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Non authentifié" };

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
