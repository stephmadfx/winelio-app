"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { geocodeAddress } from "@/lib/geocode";

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

  const alias = await generateAlias(supabase);

  const { error } = await supabase.from("companies").insert({
    ...payload,
    owner_id: user.id,
    source: "owner",
    alias,
  });

  if (error) return { error: error.message };

  if (payload.city || payload.postal_code) {
    const coords = await geocodeAddress(payload.address, payload.city, payload.postal_code);
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
