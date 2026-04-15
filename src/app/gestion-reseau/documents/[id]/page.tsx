import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import {
  addAnnotation,
  fillPlaceholder,
  updateDocumentStatus,
} from "@/app/gestion-reseau/documents/actions";

type AnnotationRow = {
  id: string;
  content: string;
  created_at: string;
  section_id: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: document } = await supabaseAdmin
    .from("legal_documents")
    .select("id, title, version, status")
    .eq("id", id)
    .single();

  if (!document) notFound();

  const { data: sections } = await supabaseAdmin
    .from("document_sections")
    .select("id, order_index, article_number, title, content")
    .eq("document_id", id)
    .order("order_index");

  const sectionIds = (sections ?? []).map((s) => s.id);

  const { data: annotationsRaw } = sectionIds.length > 0
    ? await supabaseAdmin
        .from("document_annotations")
        .select("id, content, created_at, section_id, author:profiles!author_id(id, first_name, last_name)")
        .in("section_id", sectionIds)
        .order("created_at")
    : { data: [] };

  const { data: placeholderValues } = await supabaseAdmin
    .from("document_placeholder_values")
    .select("placeholder_key, value, filled_by:profiles!filled_by(first_name)")
    .eq("document_id", id);

  // Map placeholder_key → { value, filledBy }
  const placeholderMap: Record<string, { value: string; filledBy: string }> = {};
  for (const pv of placeholderValues ?? []) {
    const filledBy = Array.isArray(pv.filled_by) ? pv.filled_by[0] : pv.filled_by;
    placeholderMap[pv.placeholder_key] = {
      value: pv.value,
      filledBy: (filledBy as { first_name: string } | null)?.first_name ?? "?",
    };
  }

  // Map sectionId → Annotation[]
  // Supabase retourne author comme tableau via le join — cast via unknown
  const annotations = (annotationsRaw ?? []) as unknown as AnnotationRow[];
  const annotationsBySectionId: Record<string, AnnotationRow[]> = {};
  for (const ann of annotations) {
    if (!annotationsBySectionId[ann.section_id]) {
      annotationsBySectionId[ann.section_id] = [];
    }
    annotationsBySectionId[ann.section_id].push(ann);
  }

  // Couleurs par auteur (ordre d'apparition)
  const authorOrder: string[] = [];
  for (const ann of annotations) {
    const authorId = ann.author?.id;
    if (authorId && !authorOrder.includes(authorId)) authorOrder.push(authorId);
  }
  const COLORS = ["bg-winelio-orange", "bg-blue-500", "bg-green-500"];
  const authorColorMap: Record<string, string> = {};
  authorOrder.forEach((uid, i) => {
    authorColorMap[uid] = COLORS[i % COLORS.length];
  });

  return (
    <DocumentViewer
      document={document}
      sections={sections ?? []}
      annotationsBySectionId={annotationsBySectionId}
      placeholderMap={placeholderMap}
      authorColorMap={authorColorMap}
      onAddAnnotation={addAnnotation}
      onFillPlaceholder={fillPlaceholder}
      onUpdateStatus={updateDocumentStatus}
    />
  );
}
