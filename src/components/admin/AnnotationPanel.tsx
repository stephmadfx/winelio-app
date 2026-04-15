"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type Section = { id: string; article_number: string; title: string };
type Annotation = {
  id: string;
  content: string;
  created_at: string;
  section_id: string;
  author: { id: string; first_name: string; last_name: string } | null;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function AnnotationThread({
  section,
  annotations,
  authorColorMap,
  isActive,
  onAddAnnotation,
  onSelect,
}: {
  section: Section;
  annotations: Annotation[];
  authorColorMap: Record<string, string>;
  isActive: boolean;
  onAddAnnotation: (sectionId: string, content: string) => Promise<void>;
  onSelect: () => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && threadRef.current) {
      threadRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isActive]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const val = inputValue;
    setInputValue("");
    startTransition(async () => {
      await onAddAnnotation(section.id, val);
    });
  }

  return (
    <div
      ref={threadRef}
      className={`rounded-xl border transition-colors ${
        isActive ? "border-winelio-orange/50 shadow-sm" : "border-border"
      }`}
    >
      <button
        onClick={onSelect}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 rounded-t-xl transition-colors"
      >
        <span className="text-xs font-bold text-winelio-orange w-6 shrink-0">
          {section.article_number}
        </span>
        <span className="text-xs font-medium text-foreground truncate flex-1">
          {section.title}
        </span>
        {annotations.length > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            {annotations.length}
          </span>
        )}
      </button>

      {annotations.length > 0 && (
        <div className="px-3 pb-2 space-y-2 border-t border-border">
          {annotations.map((ann) => {
            const authorId = ann.author?.id ?? "";
            const color = authorColorMap[authorId] ?? "bg-gray-400";
            const initials = ann.author
              ? `${ann.author.first_name[0]}${ann.author.last_name[0]}`.toUpperCase()
              : "?";
            return (
              <div key={ann.id} className="flex gap-2 pt-2">
                <div
                  className={`w-6 h-6 rounded-full ${color} text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5`}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 mb-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {ann.author?.first_name ?? "?"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {timeAgo(ann.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed">{ann.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isActive && (
        <form onSubmit={handleSubmit} className="border-t border-border px-3 py-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ajouter une annotation..."
            rows={2}
            className="w-full text-xs bg-muted/50 rounded-lg px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-winelio-orange/50 placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                handleSubmit(e as unknown as React.FormEvent);
            }}
          />
          <div className="flex justify-end mt-1.5">
            <button
              type="submit"
              disabled={!inputValue.trim() || isPending}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gradient-to-r from-winelio-orange to-winelio-amber text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Envoi..." : "Publier"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function AnnotationPanel({
  sections,
  annotationsBySectionId,
  activeSectionId,
  authorColorMap,
  onAddAnnotation,
  onSectionSelect,
}: {
  sections: Section[];
  annotationsBySectionId: Record<string, Annotation[]>;
  activeSectionId: string | null;
  authorColorMap: Record<string, string>;
  onAddAnnotation: (sectionId: string, content: string) => Promise<void>;
  onSectionSelect: (sectionId: string) => void;
}) {
  const totalAnnotations = Object.values(annotationsBySectionId).reduce(
    (acc, arr) => acc + arr.length,
    0
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Annotations · {totalAnnotations}
      </p>
      {sections.map((section) => (
        <AnnotationThread
          key={section.id}
          section={section}
          annotations={annotationsBySectionId[section.id] ?? []}
          authorColorMap={authorColorMap}
          isActive={activeSectionId === section.id}
          onAddAnnotation={onAddAnnotation}
          onSelect={() => onSectionSelect(section.id)}
        />
      ))}
    </div>
  );
}
