"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  if (user.app_metadata?.role !== "super_admin") throw new Error("Accès refusé");
  return user;
}

export async function addRecoAnnotation(
  recommendationId: string,
  stepId: string | null,
  content: string
): Promise<void> {
  const user = await assertSuperAdmin();

  if (!content.trim() || content.length > 1000) {
    throw new Error("Contenu invalide (1–1000 caractères)");
  }

  const { error } = await supabaseAdmin
    .from("recommendation_annotations")
    .insert({
      recommendation_id: recommendationId,
      recommendation_step_id: stepId,
      author_id: user.id,
      content: content.trim(),
    });

  if (error) throw new Error(`Erreur ajout annotation: ${error.message}`);
  revalidatePath(`/gestion-reseau/recommandations/${recommendationId}`);
}

export async function deleteRecoAnnotation(annotationId: string): Promise<void> {
  const user = await assertSuperAdmin();

  // Récupérer author_id ET recommendation_id en une seule query
  const { data: ann } = await supabaseAdmin
    .from("recommendation_annotations")
    .select("author_id, recommendation_id")
    .eq("id", annotationId)
    .single();

  if (!ann) throw new Error("Annotation introuvable");
  if (ann.author_id !== user.id) throw new Error("Suppression non autorisée");

  const { error } = await supabaseAdmin
    .from("recommendation_annotations")
    .delete()
    .eq("id", annotationId);

  if (error) throw new Error(`Erreur suppression annotation: ${error.message}`);
  revalidatePath(`/gestion-reseau/recommandations/${ann.recommendation_id}`);
}
