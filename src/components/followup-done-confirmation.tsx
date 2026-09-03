"use client";

import { useState } from "react";

type PaymentResult = {
  mode: "automatic_card" | "checkout" | "test";
  status: "paid" | "processing" | "pending" | "skipped";
  url?: string;
};

export function FollowupDoneConfirmation({
  token,
  afterStep,
}: {
  token: string;
  afterStep: number;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; payment?: PaymentResult | null } | null>(null);

  const isPaymentConfirmation = afterStep === 6;

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/recommendations/followup-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "done" }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Impossible d'enregistrer votre réponse pour le moment.");
        return;
      }
      setResult({ message: data.message, payment: data.payment });
    } catch {
      setError("La connexion a été interrompue. Vous pouvez réessayer sans risque de double validation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const checkoutUrl = result.payment?.mode === "checkout" ? result.payment.url : null;
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F0F2F4] p-6">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mb-4 text-5xl" aria-hidden="true">✅</div>
          <h1 className="mb-3 text-xl font-bold text-winelio-dark">Merci, c’est enregistré</h1>
          <p className="text-sm leading-6 text-winelio-gray">{result.message}</p>
          {result.payment?.mode === "automatic_card" && result.payment.status === "paid" && (
            <p className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-800">
              La commission Winelio a été réglée automatiquement.
            </p>
          )}
          {result.payment?.status === "processing" && (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              Le paiement est en cours de confirmation bancaire. Aucun nouveau clic n’est nécessaire.
            </p>
          )}
          {checkoutUrl && (
            <div className="mt-6">
              <p className="mb-4 text-sm leading-6 text-winelio-gray">
                Votre carte enregistrée nécessite une action. Utilisez le lien Stripe sécurisé ci-dessous.
              </p>
              <a
                href={checkoutUrl}
                className="inline-flex rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-6 py-3 text-sm font-bold text-white"
              >
                Régulariser avec Stripe →
              </a>
            </div>
          )}
          <a href="/" className="mt-6 inline-flex text-sm font-semibold text-winelio-orange underline">
            Aller sur Winelio
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F0F2F4] p-6">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="text-center">
          <div className="mb-3 text-5xl" aria-hidden="true">{isPaymentConfirmation ? "💳" : "✅"}</div>
          <h1 className="text-xl font-bold text-winelio-dark">
            {isPaymentConfirmation ? "Avez-vous bien encaissé votre client ?" : "Confirmer l’avancement"}
          </h1>
        </div>

        {isPaymentConfirmation ? (
          <div className="mt-6 space-y-4 text-sm leading-6 text-winelio-gray">
            <p>
              Confirmez uniquement si les travaux sont terminés et si le règlement du client a réellement été encaissé.
            </p>
            <p className="rounded-xl border-l-4 border-winelio-orange bg-[#FFF5F0] p-4">
              Après votre confirmation, Winelio débitera automatiquement la commission variable autorisée sur votre carte enregistrée : 10 % jusqu’à 25 000 € TTC, ou 5 % sur la totalité de l’affaire au-delà.
            </p>
            <p>
              Si la banque refuse le débit ou demande une authentification, un lien Stripe sécurisé sera immédiatement proposé et envoyé par email.
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm leading-6 text-winelio-gray">
            Confirmez que cette étape de la recommandation a bien été réalisée.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Confirmation en cours…"
            : isPaymentConfirmation
              ? "Oui, j’ai encaissé le paiement"
              : "Oui, confirmer cette étape"}
        </button>
        <p className="mt-3 text-center text-xs leading-5 text-winelio-gray">
          Un seul clic suffit. Les nouvelles tentatives sont protégées contre les doublons.
        </p>
      </section>
    </main>
  );
}
