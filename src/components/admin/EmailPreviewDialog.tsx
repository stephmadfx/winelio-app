"use client";

import { useEffect, useRef, useState } from "react";

const EMAIL_LABELS: Record<string, string> = {
  "new-reco-inscrit":    '📧 "Nouvelle recommandation" → Pro inscrit',
  "new-reco-scraped":    '📧 "Un client vous recommande" → Pro scrappé',
  "relance-scraped":     '⏱ Relance automatique → Pro scrappé (H+12)',
  "alerte-recommandeur": '📭 Alerte → Recommandeur (H+36)',
  "reco-refusee":        '📧 Recommandation déclinée → Recommandeur',
  "commission":          '📧 Commission à régler → Professionnel',
  "step-2":  '✉️ Étape 2 — Reco acceptée → Recommandeur',
  "step-3":  '✉️ Étape 3 — Contact établi → Recommandeur',
  "step-4":  '✉️ Étape 4 — RDV fixé → Recommandeur',
  "step-5":  '✉️ Étape 5 — Devis soumis → Recommandeur',
  "step-6":  '✉️ Étape 6 — Travaux terminés → Recommandeur',
};

export function EmailPreviewDialog({
  emailType,
  onClose,
}: {
  emailType: string;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const label = EMAIL_LABELS[emailType] ?? emailType;

  // Fetch le HTML côté client et l'injecte via srcdoc (contourne frame-ancestors 'none')
  useEffect(() => {
    setLoading(true);
    setHtmlContent(null);
    fetch(`/api/email-template/preview?type=${emailType}`)
      .then((r) => r.text())
      .then((html) => { setHtmlContent(html); setLoading(false); })
      .catch(() => setLoading(false));
  }, [emailType]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-2xl max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-0.5">Aperçu email</p>
            <p className="text-sm font-bold text-gray-800">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {/* Note données fictives */}
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
          <p className="text-xs text-amber-700">
            Aperçu avec données fictives — le contenu réel dépend des données de la recommandation.
          </p>
        </div>

        {/* Iframe avec srcdoc (contourne la CSP frame-ancestors) */}
        <div className="flex-1 overflow-auto relative" style={{ minHeight: 500 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
              <div className="w-6 h-6 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {htmlContent && (
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              className="w-full border-0"
              style={{ height: 600 }}
              sandbox="allow-same-origin"
              title={label}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
