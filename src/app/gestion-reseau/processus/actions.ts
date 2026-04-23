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

export async function addFlowAnnotation(
  nodeId: string,
  content: string
): Promise<void> {
  const user = await assertSuperAdmin();

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 1000) {
    throw new Error("Contenu invalide (1–1000 caractères)");
  }

  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("process_flow_annotations")
    .insert({ node_id: nodeId, content: trimmed, author_id: user.id });

  if (error) throw new Error(`Erreur ajout note : ${error.message}`);
  revalidatePath("/gestion-reseau/processus");
}

export async function deleteFlowAnnotation(annotationId: string): Promise<void> {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .schema("winelio")
    .from("process_flow_annotations")
    .delete()
    .eq("id", annotationId);

  if (error) throw new Error(`Erreur suppression note : ${error.message}`);
  revalidatePath("/gestion-reseau/processus");
}
