"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createDocument } from "../actions";

type Section = {
  article_number: string;
  title: string;
  content: string;
};

function parseText(text: string): Section[] {
  const sections: Section[] = [];
  const lines = text.split("\n");
  let current: Section | null = null;

  const flush = () => {
    if (current) {
      current.content = current.content.trim();
      sections.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    // Supprimer les modificateurs d'emoji (️⃣) pour normaliser "1️⃣" → "1"
    const t = line.trim().replace(/[️⃣]/g, "");

    // Séparateurs visuels : ignorer
    if (!t || t === "⸻" || t === "—" || t.match(/^-{3,}$/)) continue;

    // Sous-article : "3.1 Titre" ou "3.1. Titre"
    const sub = t.match(/^(\d+\.\d+)\.?\s+(.+)/);
    if (sub) {
      flush();
      current = { article_number: sub[1], title: sub[2].trim(), content: "" };
      continue;
    }

    // Article principal : "1 Titre" ou "1. Titre"
    const main = t.match(/^(\d+)\.?\s+(.+)/);
    if (main) {
      flush();
      current = { article_number: main[1], title: main[2].trim(), content: "" };
      continue;
    }

    // Contenu de la section courante
    if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }

  flush();
  return sections;
}

export default function NewDocumentPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("CGU / CGV Winelio");
  const [version, setVersion] = useState("1.0");
  const [rawText, setRawText] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [parsed, setParsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = () => {
    const s = parseText(rawText);
    setSections(s);
    setParsed(true);
    setError(null);
  };

  const handleSave = () => {
    if (!title.trim()) { setError("Le titre est requis."); return; }
    if (sections.length === 0) { setError("Aucune section à enregistrer."); return; }
    setError(null);

    startTransition(async () => {
      try {
        const id = await createDocument({
          title: title.trim(),
          version: version.trim() || "1.0",
          sections: sections.map((s, i) => ({ ...s, order_index: i })),
        });
        router.push(`/gestion-reseau/documents/${id}`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  };

  const updateSection = (index: number, field: keyof Section, value: string) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const addSection = () => {
    setSections((prev) => [...prev, { article_number: "", title: "", content: "" }]);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Nouveau document</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Collez le texte brut — les sections sont détectées automatiquement
          </p>
        </div>
        <Link
          href="/gestion-reseau/documents"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Annuler
        </Link>
      </div>

      {/* Métadonnées */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Titre du document
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15 bg-background"
            placeholder="CGU / CGV Winelio"
          />
        </div>
        <div className="w-full sm:w-28">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Version
          </label>
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15 bg-background"
            placeholder="1.0"
          />
        </div>
      </div>

      {/* Import texte */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <h2 className="font-semibold text-sm mb-1">Coller le texte du document</h2>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          Les sections sont détectées automatiquement à partir de la numérotation (1, 2, 3.1, 3.2…).
          Remplacez les <code className="bg-muted px-1 py-0.5 rounded text-[11px]">[à compléter]</code> par
          des clés en MAJUSCULES sans espaces, ex.{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[11px]">[SIRET]</code>{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[11px]">[NOM_EDITEUR]</code>{" "}
          pour qu&apos;elles soient éditables dans le viewer.
        </p>
        <textarea
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            setParsed(false);
          }}
          rows={14}
          className="w-full rounded-xl border border-border px-4 py-3 text-sm font-mono focus:outline-none focus:border-winelio-orange focus:ring-2 focus:ring-winelio-orange/15 bg-background resize-y"
          placeholder="Collez ici le texte brut du document…"
        />
        <button
          onClick={handleParse}
          disabled={!rawText.trim()}
          className="mt-3 px-4 py-2 rounded-xl bg-winelio-orange text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer disabled:cursor-not-allowed"
        >
          Analyser les sections →
        </button>
      </div>

      {/* Résultat parsing */}
      {parsed && sections.length === 0 && (
        <div className="bg-orange-50 dark:bg-orange-950/20 border border-winelio-orange/30 rounded-2xl p-4 mb-4 text-sm text-winelio-orange">
          Aucune section détectée. Vérifiez que les articles commencent bien par un chiffre (ex : &quot;3.1 Titre&quot;).
        </div>
      )}

      {parsed && sections.length > 0 && (
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-green-700 dark:text-green-400">
              ✓ {sections.length} sections détectées — vérifiez et corrigez si besoin
            </h2>
            <button
              onClick={addSection}
              className="text-xs text-winelio-orange hover:underline cursor-pointer"
            >
              + Ajouter une section
            </button>
          </div>

          {sections.map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <input
                  value={s.article_number}
                  onChange={(e) => updateSection(i, "article_number", e.target.value)}
                  className="w-16 text-center rounded-lg border border-border px-2 py-1.5 text-xs font-bold text-winelio-orange focus:outline-none focus:border-winelio-orange bg-winelio-orange/5"
                  placeholder="Art."
                />
                <input
                  value={s.title}
                  onChange={(e) => updateSection(i, "title", e.target.value)}
                  className="flex-1 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-winelio-orange bg-background"
                  placeholder="Titre de la section"
                />
                <button
                  onClick={() => removeSection(i)}
                  className="text-muted-foreground hover:text-red-500 transition-colors text-sm leading-none p-1 cursor-pointer"
                  title="Supprimer cette section"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={s.content}
                onChange={(e) => updateSection(i, "content", e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-border px-3 py-2 text-xs font-mono text-muted-foreground focus:outline-none focus:border-winelio-orange/50 bg-background resize-y"
                placeholder="Contenu de la section…"
              />
            </div>
          ))}
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-2xl p-4 mb-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Actions */}
      {parsed && sections.length > 0 && (
        <div className="flex items-center justify-end gap-3 pb-8">
          <Link
            href="/gestion-reseau/documents"
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Annuler
          </Link>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-5 py-2.5 rounded-xl bg-winelio-orange text-white text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending ? "Enregistrement…" : "Créer le document →"}
          </button>
        </div>
      )}
    </div>
  );
}
