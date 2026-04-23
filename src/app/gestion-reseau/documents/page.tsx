import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";


const STATUS_LABELS = {
  draft: { label: "Brouillon", classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  reviewing: { label: "En révision", classes: "bg-orange-100 text-winelio-orange dark:bg-orange-950/30" },
  validated: { label: "Validé", classes: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400" },
} as const;

export default async function DocumentsPage() {
  const { data: documents } = await supabaseAdmin
    .from("legal_documents")
    .select("id, title, version, status, created_at")
    .order("created_at", { ascending: true });

  const counts = await Promise.all(
    (documents ?? []).map(async (doc) => {
      const { data: sectionIds } = await supabaseAdmin
        .from("document_sections")
        .select("id")
        .eq("document_id", doc.id);

      const ids = (sectionIds ?? []).map((s) => s.id);

      const [{ count: annotCount }, { data: placeholders }] = await Promise.all([
        ids.length > 0
          ? supabaseAdmin
              .from("document_annotations")
              .select("id", { count: "exact", head: true })
              .in("section_id", ids)
          : Promise.resolve({ count: 0, data: null, error: null }),
        supabaseAdmin
          .from("document_placeholder_values")
          .select("placeholder_key")
          .eq("document_id", doc.id),
      ]);

      const { data: sections } = await supabaseAdmin
        .from("document_sections")
        .select("content")
        .eq("document_id", doc.id);

      const allContent = (sections ?? []).map((s) => s.content).join("\n");
      const allKeys = [...allContent.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      const uniqueKeys = [...new Set(allKeys)];
      const filledKeys = new Set((placeholders ?? []).map((p) => p.placeholder_key));
      const remainingPlaceholders = uniqueKeys.filter((k) => !filledKeys.has(k)).length;

      return { docId: doc.id, annotations: annotCount ?? 0, remainingPlaceholders };
    })
  );

  const countMap = Object.fromEntries(counts.map((c) => [c.docId, c]));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Documents légaux à réviser et valider
          </p>
        </div>
        <Link
          href="/gestion-reseau/documents/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-winelio-orange text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau document
        </Link>
      </div>

      {(!documents || documents.length === 0) ? (
        <div className="text-center py-20 text-muted-foreground">
          Aucun document pour l'instant.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const status = STATUS_LABELS[doc.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.draft;
            const c = countMap[doc.id];
            return (
              <Link
                key={doc.id}
                href={`/gestion-reseau/documents/${doc.id}`}
                className="block bg-card border border-border rounded-2xl p-5 hover:border-winelio-orange/50 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-winelio-orange to-winelio-amber rounded-xl flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.classes}`}>
                    {status.label}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-winelio-orange transition-colors">
                  {doc.title}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 mb-4">Version {doc.version}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border pt-3">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                    </svg>
                    {c?.annotations ?? 0} annotation{(c?.annotations ?? 0) !== 1 ? "s" : ""}
                  </span>
                  {(c?.remainingPlaceholders ?? 0) > 0 && (
                    <span className="flex items-center gap-1 text-winelio-orange font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {c.remainingPlaceholders} placeholder{c.remainingPlaceholders !== 1 ? "s" : ""} restant{c.remainingPlaceholders !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
