"use client";

import { useState } from "react";
import { AnnotationPanel } from "./AnnotationPanel";
import { renderContentWithPlaceholders } from "./PlaceholderEditor";

type Section = {
  id: string;
  order_index: number;
  article_number: string;
  title: string;
  content: string;
};

type Annotation = {
  id: string;
  content: string;
  created_at: string;
  section_id: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

type PlaceholderMap = Record<string, { value: string; filledBy: string }>;

const STATUS_CONFIG = {
  draft: { label: "Brouillon", classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  reviewing: { label: "En révision", classes: "bg-orange-100 text-winelio-orange" },
  validated: { label: "Validé", classes: "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400" },
} as const;

export function DocumentViewer({
  document,
  sections,
  annotationsBySectionId,
  placeholderMap,
  authorColorMap,
  onAddAnnotation,
  onFillPlaceholder,
  onUpdateStatus,
}: {
  document: { id: string; title: string; version: string; status: string };
  sections: Section[];
  annotationsBySectionId: Record<string, Annotation[]>;
  placeholderMap: PlaceholderMap;
  authorColorMap: Record<string, string>;
  onAddAnnotation: (sectionId: string, content: string) => Promise<void>;
  onFillPlaceholder: (documentId: string, key: string, value: string) => Promise<void>;
  onUpdateStatus: (documentId: string, status: "draft" | "reviewing" | "validated") => Promise<void>;
}) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const statusConf = STATUS_CONFIG[document.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft;

  const totalAnnotations = Object.values(annotationsBySectionId).reduce(
    (acc, arr) => acc + arr.length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold">{document.title}</h1>
          <p className="text-sm text-muted-foreground">
            Version {document.version} · {totalAnnotations} annotation{totalAnnotations !== 1 ? "s" : ""}
          </p>
        </div>
        <select
          defaultValue={document.status}
          onChange={async (e) => {
            await onUpdateStatus(document.id, e.target.value as "draft" | "reviewing" | "validated");
          }}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border-0 cursor-pointer ${statusConf.classes}`}
        >
          <option value="draft">Brouillon</option>
          <option value="reviewing">En révision</option>
          <option value="validated">Validé</option>
        </select>
      </div>

      {/* Layout 2 colonnes */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Colonne gauche — Document */}
        <div className="flex-[65] overflow-y-auto pr-2 space-y-6">
          {sections.map((section) => {
            const sectionAnnotations = annotationsBySectionId[section.id] ?? [];
            return (
              <div
                key={section.id}
                id={`section-${section.id}`}
                className={`bg-card border rounded-2xl p-5 transition-colors ${
                  activeSectionId === section.id
                    ? "border-winelio-orange/50 shadow-sm"
                    : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-winelio-orange to-winelio-amber text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {section.article_number}
                    </span>
                    <h3 className="font-semibold text-sm">{section.title}</h3>
                  </div>
                  <button
                    onClick={() => setActiveSectionId(section.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-winelio-orange transition-colors shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
                    </svg>
                    Annoter
                    {sectionAnnotations.length > 0 && (
                      <span className="ml-0.5 bg-winelio-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {sectionAnnotations.length}
                      </span>
                    )}
                  </button>
                </div>
                <div className="text-sm text-foreground leading-relaxed">
                  {renderContentWithPlaceholders(
                    section.content,
                    placeholderMap,
                    (key, value) => onFillPlaceholder(document.id, key, value)
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Colonne droite — Annotations */}
        <div className="flex-[35] overflow-y-auto">
          <AnnotationPanel
            sections={sections}
            annotationsBySectionId={annotationsBySectionId}
            activeSectionId={activeSectionId}
            authorColorMap={authorColorMap}
            onAddAnnotation={onAddAnnotation}
            onSectionSelect={setActiveSectionId}
          />
        </div>
      </div>
    </div>
  );
}
