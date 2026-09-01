"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { WinelioLogo } from "@/components/winelio-logo";

type ActionDetails = {
  purpose: "quote" | "completion";
  status: string;
  alreadyProcessed: boolean;
  amount: number | null;
  expectedCompletionAt: string | null;
  contactFirstName: string | null;
  professionalName: string;
};

export default function ClientRecommendationActionPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [details, setDetails] = useState<ActionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<"confirmed" | "disputed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recommendations/client-action?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Lien indisponible");
        if (!cancelled) setDetails(data);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError.message || "Lien indisponible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (decision: "confirm" | "dispute") => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/recommendations/client-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, decision, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Réponse non enregistrée");
      setResult(decision === "confirm" ? "confirmed" : "disputed");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Réponse non enregistrée",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isQuote = details?.purpose === "quote";
  const alreadyProcessed = details?.alreadyProcessed;

  return (
    <main className="min-h-screen bg-[#F0F2F4] px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl shadow-black/5">
        <div className="h-1 bg-gradient-to-r from-winelio-orange to-winelio-amber" />
        <div className="px-6 py-8 sm:px-10 sm:py-10">
          <div className="mb-8 flex justify-center border-b border-gray-100 pb-7">
            <WinelioLogo variant="color" height={44} />
          </div>

          {loading ? (
            <div className="space-y-4" aria-live="polite">
              <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl bg-orange-100" />
              <div className="mx-auto h-7 w-3/4 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-24 animate-pulse rounded-2xl bg-gray-50" />
            </div>
          ) : error && !details ? (
            <div className="text-center" role="alert">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-2xl">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-winelio-dark">Lien indisponible</h1>
              <p className="mt-3 text-sm leading-6 text-winelio-gray">{error}</p>
            </div>
          ) : result || alreadyProcessed ? (
            <div className="text-center" aria-live="polite">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-3xl">
                {result === "disputed" ? "📝" : "✅"}
              </div>
              <h1 className="text-xl font-bold text-winelio-dark">
                {result === "disputed"
                  ? "Votre signalement est enregistré"
                  : alreadyProcessed
                    ? "Réponse déjà enregistrée"
                    : "Merci pour votre confirmation"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-winelio-gray">
                {result === "disputed"
                  ? "Le professionnel et le recommandeur ont été informés. L'affaire reste ouverte jusqu'à la résolution du problème."
                  : isQuote
                    ? "Le professionnel peut désormais poursuivre la prestation."
                    : "La prestation est confirmée et l'affaire peut être clôturée."}
              </p>
            </div>
          ) : details ? (
            <div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 text-3xl">
                  {isQuote ? "📄" : "🔧"}
                </div>
                <p className="text-sm text-winelio-gray">
                  Bonjour {details.contactFirstName || ""}
                </p>
                <h1 className="mt-1 text-2xl font-black text-winelio-dark">
                  {isQuote
                    ? "Confirmez-vous ce devis ?"
                    : "La prestation est-elle terminée et conforme ?"}
                </h1>
              </div>

              <div className="mt-6 rounded-2xl bg-[#FFF5F0] p-5 ring-1 ring-orange-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-winelio-orange">
                  Professionnel
                </p>
                <p className="mt-1 font-bold text-winelio-dark">
                  {details.professionalName}
                </p>
                {isQuote && details.amount != null && (
                  <p className="mt-4 text-3xl font-black text-winelio-dark">
                    {Number(details.amount).toLocaleString("fr-FR")} €
                  </p>
                )}
                <p className="mt-2 text-sm leading-6 text-winelio-gray">
                  {isQuote
                    ? "En confirmant, vous indiquez avoir accepté le devis présenté. Aucun paiement ne sera effectué sur cette page."
                    : "En confirmant, vous indiquez que la prestation est terminée et conforme. Le professionnel a déclaré avoir reçu votre paiement."}
                </p>
              </div>

              {showDispute ? (
                <div className="mt-5">
                  <label
                    htmlFor="client-note"
                    className="mb-2 block text-sm font-bold text-winelio-dark"
                  >
                    Que faut-il corriger ?
                  </label>
                  <textarea
                    id="client-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder={
                      isQuote
                        ? "Ex. : je n'ai pas encore accepté ce devis…"
                        : "Ex. : les travaux ne sont pas terminés…"
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-winelio-orange focus:ring-2 focus:ring-orange-100"
                  />
                  <p className="mt-1 text-right text-xs text-winelio-gray">
                    {note.length}/1000
                  </p>
                </div>
              ) : null}

              {error && (
                <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100" role="alert">
                  {error}
                </div>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {showDispute ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDispute(false);
                        setError(null);
                      }}
                      disabled={submitting}
                      className="rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-bold text-winelio-dark disabled:opacity-50"
                    >
                      Retour
                    </button>
                    <button
                      type="button"
                      onClick={() => submit("dispute")}
                      disabled={submitting || note.trim().length < 5}
                      className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Enregistrement…" : "Signaler le problème"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowDispute(true)}
                      disabled={submitting}
                      className="rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-bold text-winelio-dark disabled:opacity-50"
                    >
                      Non, signaler un problème
                    </button>
                    <button
                      type="button"
                      onClick={() => submit("confirm")}
                      disabled={submitting}
                      className="rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-4 py-3 text-sm font-bold text-white shadow-md shadow-orange-200 disabled:opacity-50"
                    >
                      {submitting
                        ? "Enregistrement…"
                        : isQuote
                          ? "Oui, devis accepté"
                          : "Oui, tout est conforme"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
