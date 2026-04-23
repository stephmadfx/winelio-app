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

export async function addAnnotation(sectionId: string, content: string) {
  const user = await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("document_annotations")
    .insert({ section_id: sectionId, author_id: user.id, content: content.trim() });

  if (error) throw new Error(`Erreur annotation : ${error.message}`);

  revalidatePath("/gestion-reseau/documents", "layout");
}

export async function fillPlaceholder(
  documentId: string,
  placeholderKey: string,
  value: string
) {
  const user = await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("document_placeholder_values")
    .upsert(
      {
        document_id: documentId,
        placeholder_key: placeholderKey,
        value: value.trim(),
        filled_by: user.id,
        filled_at: new Date().toISOString(),
      },
      { onConflict: "document_id,placeholder_key" }
    );

  if (error) throw new Error(`Erreur placeholder : ${error.message}`);

  revalidatePath("/gestion-reseau/documents", "layout");
}

export async function updateDocumentStatus(
  documentId: string,
  status: "draft" | "reviewing" | "validated"
) {
  await assertSuperAdmin();

  const { error } = await supabaseAdmin
    .from("legal_documents")
    .update({ status })
    .eq("id", documentId);

  if (error) throw new Error(`Erreur statut : ${error.message}`);

  revalidatePath("/gestion-reseau/documents", "layout");
}

export async function createDocument(input: {
  title: string;
  version: string;
  sections: { article_number: string; title: string; content: string; order_index: number }[];
}): Promise<string> {
  await assertSuperAdmin();

  const { data: doc, error } = await supabaseAdmin
    .from("legal_documents")
    .insert({ title: input.title, version: input.version, status: "draft" })
    .select("id")
    .single();

  if (error || !doc) throw new Error(error?.message ?? "Erreur création document");

  if (input.sections.length > 0) {
    const { error: secErr } = await supabaseAdmin
      .from("document_sections")
      .insert(
        input.sections.map((s) => ({
          document_id: doc.id,
          article_number: s.article_number,
          title: s.title,
          content: s.content,
          order_index: s.order_index,
        }))
      );
    if (secErr) throw new Error(`Erreur sections : ${secErr.message}`);
  }

  revalidatePath("/gestion-reseau/documents");
  return doc.id;
}
