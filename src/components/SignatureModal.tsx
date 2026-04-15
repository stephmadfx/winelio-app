"use client";

import { useState, useRef, useCallback } from "react";
import SignaturePad, { type SignaturePadRef } from "@/components/SignaturePad";
import { signAgentCGU } from "@/app/(protected)/profile/pro-onboarding/sign-action";

type Section = {
  article_number: string;
  title: string;
  content: string;
};

type Props = {
  cguDocumentId: string;
  sections: Section[];
  onClose: () => void;
};

export default function SignatureModal({ cguDocumentId, sections, onClose }: Props) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const padRef = useRef<SignaturePadRef>(null);
  const [padEmpty, setPadEmpty] = useState(true);

  const handleDocScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledToBottom(true);
    }
  }, []);

  const handleClear = () => {
    padRef.current?.clear();
    setPadEmpty(true);
  };

  const handlePadChange = () => {
    setPadEmpty(padRef.current?.isEmpty() ?? true);
  };

  const handleSubmit = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSubmitting(true);
    setError(null);
    try {
      const signatureBase64 = padRef.current.toDataURL();
      const result = await signAgentCGU({ signatureBase64, cguDocumentId });
      setPdfUrl(result.pdfUrl);
      // Countdown 5s → /dashboard
      let count = 5;
      setCountdown(count);
      const interval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(interval);
          window.location.href = "/dashboard";
        }
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la signature");
    } finally {
      setSubmitting(false);
    }
  };

  if (pdfUrl !== null) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4">
          <span className="text-emerald-400 text-3xl">✓</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">CGU signées avec succès</h2>
        <p className="text-gray-500 text-sm mb-6 text-center">
          Votre exemplaire certifié a été envoyé par email.
        </p>
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-white bg-winelio-orange hover:bg-orange-600 px-5 py-2.5 rounded-xl font-medium mb-4 transition-colors"
        >
          Télécharger mon exemplaire (PDF)
        </a>
        {countdown !== null && (
          <p className="text-xs text-gray-400">
            Redirection vers votre tableau de bord dans {countdown}s…
          </p>
        )}
      </div>
    );
  }

  const canSign = hasScrolledToBottom && !padEmpty;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <h2 className="text-base font-semibold text-gray-900">
          Signature des CGU Agents Immobiliers
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>

      {/* Zone document (60%) */}
      <div
        className="overflow-y-scroll flex-[3] bg-gray-50 px-4 py-4"
        onScroll={handleDocScroll}
      >
        {sections.map((s) => (
          <div key={s.article_number} className="mb-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              Article {s.article_number} — {s.title}
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
              {s.content}
            </p>
          </div>
        ))}
        {!hasScrolledToBottom && (
          <p className="text-center text-xs text-orange-500 mt-2 pb-2">
            Faites défiler jusqu&apos;en bas pour activer la signature ↓
          </p>
        )}
      </div>

      {/* Zone signature (40%) */}
      <div className="flex-[2] border-t border-gray-200 flex flex-col px-4 py-3 shrink-0">
        <p className="text-xs text-gray-500 mb-2">Signez dans le cadre ci-dessous</p>
        <div
          className="flex-1 border border-gray-300 rounded-lg overflow-hidden mb-2 min-h-[80px]"
          onPointerUp={handlePadChange}
        >
          <SignaturePad
            ref={padRef}
            className="w-full h-full"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClear}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
          >
            Effacer
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSign || submitting}
            className="flex-1 text-sm font-semibold text-white px-4 py-2 rounded-xl transition-colors
              bg-gradient-to-r from-winelio-orange to-winelio-amber
              disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            {submitting ? "Signature en cours…" : "Je signe et j'accepte"}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}
      </div>
    </div>
  );
}
