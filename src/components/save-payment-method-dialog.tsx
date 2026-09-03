"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  STRIPE_OFF_SESSION_CONSENT_TEXT,
  STRIPE_OFF_SESSION_CONSENT_VERSION,
} from "@/lib/stripe-off-session-consent";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(key).catch((err) => {
        console.error("[stripe] loadStripe failed:", err);
        return null;
      });
    }
  }
  return stripePromise;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (info: { brand: string | null; last4: string | null }) => void;
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const ELEMENT_READY_TIMEOUT_MS = 20_000;

function stripeReturnUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("setup_intent_return", "1");
  return url.toString();
}

function persistPaymentMethod(setupIntentId: string) {
  return fetch("/api/stripe/payment-method", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupIntentId }),
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? `Erreur enregistrement (${res.status})`);
    }
    return data as { brand: string | null; last4: string | null };
  });
}

function clearSetupReturnParams() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  ["setup_intent", "setup_intent_client_secret", "redirect_status", "setup_intent_return"].forEach(
    (key) => url.searchParams.delete(key),
  );
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function SavePaymentMethodDialog({ open, onClose, onSaved }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demoProcessing, setDemoProcessing] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const returnHandled = useRef(false);

  // Reprise après 3-D Secure : Stripe redirige vers return_url avec setup_intent=…
  useEffect(() => {
    if (DEMO_MODE || returnHandled.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const setupIntentId = params.get("setup_intent");
    const redirectStatus = params.get("redirect_status");
    if (!setupIntentId) return;
    returnHandled.current = true;

    if (redirectStatus && redirectStatus !== "succeeded") {
      setLoadError("La vérification 3-D Secure n'a pas abouti. Réessayez d'enregistrer votre carte.");
      clearSetupReturnParams();
      return;
    }

    persistPaymentMethod(setupIntentId)
      .then((data) => {
        clearSetupReturnParams();
        onSaved({ brand: data.brand ?? null, last4: data.last4 ?? null });
        onClose();
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Erreur après 3-D Secure");
      });
  }, [onSaved, onClose]);

  // Branche mode démo : simule un enregistrement de carte (2s de latence visuelle
  // puis appel API qui pose une fausse carte sur le profil).
  useEffect(() => {
    if (!open || !DEMO_MODE) return;
    setDemoProcessing(true);
    let cancelled = false;
    const start = Date.now();
    fetch("/api/stripe/demo-bypass", { method: "POST" })
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (cancelled) return;
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          if (cancelled) return;
          setDemoProcessing(false);
          if (data?.success) {
            onSaved({ brand: data.brand ?? null, last4: data.last4 ?? null });
            onClose();
          } else {
            setLoadError(data?.error ?? "Erreur en mode démo");
          }
        }, remaining);
      })
      .catch((err) => {
        if (cancelled) return;
        setDemoProcessing(false);
        setLoadError(err instanceof Error ? err.message : "Erreur en mode démo");
      });
    return () => { cancelled = true; };
  }, [open, onSaved, onClose]);

  useEffect(() => {
    if (open) return;
    setClientSecret(null);
    setLoadError(null);
    setConsentAccepted(false);
    setStripeLoading(false);
  }, [open]);

  async function initializeStripe() {
    if (!consentAccepted || stripeLoading) return;
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      setLoadError("Configuration Stripe manquante. Réessayez plus tard ou contactez le support.");
      return;
    }

    setStripeLoading(true);
    setLoadError(null);
    fetch("/api/stripe/setup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentAccepted: true,
        consentVersion: STRIPE_OFF_SESSION_CONSENT_VERSION,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? `Erreur initialisation Stripe (${r.status})`);
        if (!data.clientSecret) throw new Error("Stripe n'a pas renvoyé de session de paiement");
        return data;
      })
      .then((d) => {
        setClientSecret(d.clientSecret);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Impossible d'initialiser Stripe");
      })
      .finally(() => setStripeLoading(false));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-end justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:items-center">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 my-auto max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100"
          aria-label="Fermer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center text-white text-lg">
            💳
          </div>
          <div>
            <h2 className="font-bold text-winelio-dark">Enregistrer votre carte</h2>
            <p className="text-xs text-winelio-gray">Aucun débit aujourd&apos;hui</p>
          </div>
        </div>

        {DEMO_MODE ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-xs text-amber-900 leading-relaxed">
            🧪 <strong>Mode démo</strong> — aucune vraie carte requise. On simule
            l&apos;enregistrement d&apos;une carte fictive (Visa •••• 4242) pour que tu puisses
            tester l&apos;ensemble du parcours.
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-winelio-light/60 border border-winelio-orange/20 p-3 mb-3 text-xs text-winelio-dark leading-relaxed">
              Pour accéder aux coordonnées du lead, enregistrez une carte bancaire.
              Aucun montant n&apos;est débité aujourd&apos;hui.
            </div>
            <div className="rounded-xl border border-winelio-orange/25 bg-orange-50 p-3 mb-3 text-xs text-winelio-dark leading-relaxed">
              <p className="font-bold">Autorisation de débits futurs</p>
              <p className="mt-2">{STRIPE_OFF_SESSION_CONSENT_TEXT}</p>
            </div>
            {!clientSecret && (
              <>
                <label className="mb-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-gray-200 p-3 text-xs leading-relaxed text-winelio-dark">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(event) => setConsentAccepted(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-winelio-orange"
                  />
                  <span>
                    J&apos;autorise ces débits automatiques et j&apos;accepte les{" "}
                    <Link
                      href="/documents-legaux/conditions-professionnels"
                      target="_blank"
                      className="font-semibold text-winelio-orange underline"
                    >
                      Conditions Professionnels / CGV
                    </Link>.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={initializeStripe}
                  disabled={!consentAccepted || stripeLoading}
                  className="mb-3 w-full rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {stripeLoading ? "Ouverture du formulaire sécurisé…" : "Continuer vers la saisie de la carte"}
                </button>
              </>
            )}
          </>
        )}

        {DEMO_MODE && demoProcessing && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-8 h-8 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-winelio-gray">Enregistrement de la carte fictive…</p>
          </div>
        )}

        {loadError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
            {loadError}
          </p>
        )}

        {!DEMO_MODE && stripeLoading && !clientSecret && !loadError && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-winelio-orange border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!DEMO_MODE && clientSecret && (
          <Elements
            stripe={getStripe()}
            options={{
              clientSecret,
              appearance: { theme: "stripe" },
              locale: "fr",
            }}
          >
            <SetupIntentForm onSaved={onSaved} onClose={onClose} />
          </Elements>
        )}
      </div>
    </div>
  );
}

function SetupIntentForm({
  onSaved,
  onClose,
}: {
  onSaved: Props["onSaved"];
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elementReady, setElementReady] = useState(false);

  useEffect(() => {
    if (elementReady) return;
    const timer = window.setTimeout(() => {
      setError(
        "Le formulaire de carte n'a pas pu s'afficher. Vérifiez votre connexion, désactivez un bloqueur de publicités, puis réessayez.",
      );
    }, ELEMENT_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [elementReady]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!stripe || !elements) {
      setError("Stripe n'est pas encore prêt. Patientez une seconde puis réessayez.");
      return;
    }
    if (!elementReady) {
      setError("Le formulaire de carte charge encore. Patientez jusqu'à ce qu'il s'affiche, puis réessayez.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: submitErr } = await elements.submit();
      if (submitErr) {
        setError(submitErr.message ?? "Vérifiez les informations de votre carte.");
        return;
      }

      const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: stripeReturnUrl() },
        redirect: "if_required",
      });

      if (confirmErr) {
        setError(confirmErr.message ?? "Erreur de validation de la carte");
        return;
      }

      if (setupIntent?.status === "requires_action") {
        setError("Une vérification supplémentaire est requise. Suivez les instructions à l'écran.");
        return;
      }

      if (setupIntent?.status !== "succeeded") {
        setError(`L'enregistrement n'est pas terminé (statut : ${setupIntent?.status ?? "inconnu"}). Réessayez.`);
        return;
      }

      if (!setupIntent.id) {
        setError("Stripe n'a pas renvoyé d'identifiant. Réessayez.");
        return;
      }

      const data = await persistPaymentMethod(setupIntent.id);
      onSaved({ brand: data.brand ?? null, last4: data.last4 ?? null });
      onClose();
    } catch (err) {
      console.error("[stripe] confirmSetup:", err);
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer la carte. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
          wallets: { applePay: "never", googlePay: "never" },
        }}
        onReady={() => {
          setElementReady(true);
          setError(null);
        }}
        onLoadError={(event) => {
          setError(
            event.error?.message
              ?? "Impossible de charger le formulaire de carte. Réessayez dans un instant.",
          );
        }}
      />
      {!elementReady && !error && (
        <p className="text-xs text-winelio-gray text-center">Chargement du formulaire sécurisé…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Enregistrement…" : "Enregistrer et autoriser (0 € aujourd’hui)"}
      </button>
      <p className="text-[10px] text-winelio-gray text-center">
        Paiements sécurisés via Stripe · 3D Secure · PCI DSS Level 1
      </p>
    </form>
  );
}
