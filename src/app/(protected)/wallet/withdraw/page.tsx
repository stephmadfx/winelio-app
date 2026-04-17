"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

type PaymentMethod = "bank_transfer";

type Step = "form" | "confirm" | "success";

export default function WithdrawPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [amount, setAmount] = useState("");
  const method: PaymentMethod = "bank_transfer";
  const [iban, setIban] = useState("");

  const MIN_AMOUNT = 10;
  const MAX_AMOUNT = 10000;
  const FREE_THRESHOLD = 50;
  const STRIPE_FEE = 0.25;

  useEffect(() => {
    async function fetchBalance() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("user_wallet_summaries")
          .select("available")
          .eq("user_id", user.id)
          .single();

        setAvailable(data?.available ?? 0);
      } finally {
        setLoading(false);
      }
    }
    fetchBalance();
  }, []);

  const parsedAmount = parseFloat(amount) || 0;
  const feeAmount = parsedAmount > 0 && parsedAmount < FREE_THRESHOLD ? STRIPE_FEE : 0;
  const netAmount = parsedAmount - feeAmount;

  function validate(): string | null {
    if (!amount || parsedAmount <= 0) return "Veuillez saisir un montant.";
    if (parsedAmount < MIN_AMOUNT)
      return `Le montant minimum est de ${MIN_AMOUNT} EUR.`;
    if (parsedAmount > MAX_AMOUNT)
      return `Le montant maximum est de ${MAX_AMOUNT} EUR.`;
    if (parsedAmount > available)
      return "Le montant depasse votre solde disponible.";
    if (!iban.trim())
      return "Veuillez saisir votre IBAN.";
    return null;
  }

  function handleContinue() {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          payment_method: method,
          iban: iban.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Une erreur est survenue.");
      }

      setStep("success");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/wallet"
          className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <svg
            className="w-4 h-4 text-winelio-dark"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-winelio-dark">
            Demander un retrait
          </h1>
          <p className="text-winelio-gray text-sm mt-1">
            Solde disponible :{" "}
            <span className="font-semibold text-winelio-orange">
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
              }).format(available)}
            </span>
          </p>
        </div>
      </div>

      {/* Beta test notice */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <span className="shrink-0 w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-base">
          🧪
        </span>
        <div className="text-sm text-amber-900 leading-snug">
          <strong>Application en phase de test (bêta)</strong> — Les montants
          affichés sont <strong>fictifs</strong> et ne correspondent en aucun
          cas à de l&apos;argent réel. Les retraits sont{" "}
          <strong>désactivés</strong> pendant cette phase.
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {["Montant", "Confirmation", "Termine"].map((label, i) => {
          const stepIndex = ["form", "confirm", "success"].indexOf(step);
          const isActive = i <= stepIndex;
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  isActive
                    ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
                    : "bg-gray-100 text-winelio-gray"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  isActive ? "text-winelio-dark" : "text-winelio-gray"
                }`}
              >
                {label}
              </span>
              {i < 2 && (
                <div
                  className={`flex-1 h-px ${
                    i < stepIndex ? "bg-winelio-orange" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Form Step */}
      {step === "form" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-winelio-dark mb-2">
              Montant du retrait
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={MIN_AMOUNT}
                max={Math.min(MAX_AMOUNT, available)}
                step="0.01"
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-14 text-lg font-semibold text-winelio-dark focus:outline-none focus:ring-2 focus:ring-winelio-orange/30 focus:border-winelio-orange"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-winelio-gray">
                EUR
              </span>
            </div>
            <p className="text-xs text-winelio-gray mt-1.5">
              Min. {MIN_AMOUNT} EUR - Max.{" "}
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
              }).format(Math.min(MAX_AMOUNT, available))}
            </p>

            {/* Bloc frais */}
            {parsedAmount > 0 && (
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm space-y-1.5 ${
                feeAmount > 0
                  ? "bg-amber-50 border border-amber-200"
                  : "bg-green-50 border border-green-200"
              }`}>
                {feeAmount > 0 ? (
                  <>
                    <div className="flex justify-between text-amber-800">
                      <span>Frais de traitement Stripe</span>
                      <span className="font-semibold">
                        − {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(feeAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-amber-900 font-semibold border-t border-amber-200 pt-1.5">
                      <span>Vous recevrez</span>
                      <span>
                        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(netAmount)}
                      </span>
                    </div>
                    <p className="text-xs text-amber-700 pt-0.5">
                      Les retraits à partir de {FREE_THRESHOLD} € sont gratuits.
                    </p>
                  </>
                ) : (
                  <div className="flex justify-between text-green-800 font-medium">
                    <span>Frais de traitement</span>
                    <span>Gratuit</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* IBAN */}
          <div>
            <label className="block text-sm font-medium text-winelio-dark mb-2">
              IBAN
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              placeholder="FR76 1234 5678 9012 3456 7890 123"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-winelio-dark font-mono focus:outline-none focus:ring-2 focus:ring-winelio-orange/30 focus:border-winelio-orange"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            onClick={handleContinue}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Continuer
          </button>
        </div>
      )}

      {/* Confirm Step */}
      {step === "confirm" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-winelio-dark">
            Recapitulatif
          </h2>

          <div className="space-y-4">
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-winelio-gray">Montant demandé</span>
              <span className="text-sm font-semibold text-winelio-dark">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(parsedAmount)}
              </span>
            </div>
            {feeAmount > 0 && (
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-amber-700">Frais de traitement Stripe</span>
                <span className="text-sm font-semibold text-amber-700">
                  − {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(feeAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-winelio-dark">Vous recevrez</span>
              <span className="text-sm font-bold text-winelio-dark">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(netAmount)}
              </span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-winelio-gray">Méthode</span>
              <span className="text-sm font-semibold text-winelio-dark">Virement bancaire</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-sm text-winelio-gray">IBAN</span>
              <span className="text-sm font-semibold text-winelio-dark">{iban}</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-sm text-winelio-gray">Solde après retrait</span>
              <span className="text-sm font-semibold text-winelio-orange">
                {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(available - parsedAmount)}
              </span>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("form");
                setError("");
              }}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-winelio-dark font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Modifier
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Envoi..." : "Confirmer le retrait"}
            </button>
          </div>
        </div>
      )}

      {/* Success Step */}
      {step === "success" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-winelio-dark">
            Demande envoyee
          </h2>
          <p className="text-sm text-winelio-gray max-w-sm mx-auto">
            Votre demande de retrait a été enregistrée. Vous recevrez{" "}
            <span className="font-semibold text-winelio-dark">
              {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(netAmount)}
            </span>
            {feeAmount > 0 && (
              <span> (après déduction de {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(feeAmount)} de frais)</span>
            )}
            . Vous serez notifié une fois le traitement effectué.
          </p>
          <button
            onClick={() => router.push("/wallet")}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Retour au portefeuille
          </button>
        </div>
      )}
    </div>
  );
}
