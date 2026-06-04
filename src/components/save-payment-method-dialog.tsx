"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY manquant");
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (info: { brand: string | null; last4: string | null }) => void;
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function SavePaymentMethodDialog({ open, onClose, onSaved }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demoProcessing, setDemoProcessing] = useState(false);

  // Branche mode démo : simule un enregistrement de carte (2s de latence visuelle
  // puis appel API qui pose une fausse carte sur le profil).
  useEffect(() => {
    if (!open || !DEMO_MODE) return;
    setDemoProcessing(true);
    let cancelled = false;
    const start = Date.now();
    fetch("/api/stripe/demo-bypass", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Garantit un minimum de 2s d'affichage pour ne pas paraître instantané
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
        setLoadError(err.message);
      });
    return () => { cancelled = true; };
  }, [open, onSaved, onClose]);

  useEffect(() => {
    if (!open || DEMO_MODE) {
      if (!open) {
        setClientSecret(null);
        setLoadError(null);
      }
      return;
    }
    fetch("/api/stripe/setup-intent", { method: "POST" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Erreur initialisation Stripe");
        return data;
      })
      .then((d) => setClientSecret(d.clientSecret))
      .catch((err) => setLoadError(err.message));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
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
          <div className="rounded-xl bg-winelio-light/60 border border-winelio-orange/20 p-3 mb-4 text-xs text-winelio-dark leading-relaxed">
            Pour accéder aux coordonnées du lead, enregistrez une carte bancaire.
            <br />
            <strong>0 € prélevé maintenant</strong> — la commission d'intermédiation Winelio de 10 % sera
            prélevée automatiquement au moment du paiement du client (étape 7).
          </div>
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

        {!DEMO_MODE && !clientSecret && !loadError && (
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
    });

    if (confirmErr) {
      setError(confirmErr.message ?? "Erreur de validation");
      setSubmitting(false);
      return;
    }

    if (setupIntent?.status !== "succeeded") {
      setError(`Statut inattendu : ${setupIntent?.status}`);
      setSubmitting(false);
      return;
    }

    const res = await fetch("/api/stripe/payment-method", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setupIntentId: setupIntent.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Erreur enregistrement");
      setSubmitting(false);
      return;
    }

    onSaved({ brand: data.brand ?? null, last4: data.last4 ?? null });
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Enregistrement…" : "Enregistrer ma carte (0 €)"}
      </button>
      <p className="text-[10px] text-winelio-gray text-center">
        Paiements sécurisés via Stripe · 3D Secure · PCI DSS Level 1
      </p>
    </form>
  );
}
