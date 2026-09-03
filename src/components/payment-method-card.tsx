"use client";

import { useEffect, useState } from "react";
import { SavePaymentMethodDialog } from "@/components/save-payment-method-dialog";

type PaymentStatus = {
  hasPaymentMethod: boolean;
  hasCurrentOffSessionConsent: boolean;
  brand: string | null;
  last4: string | null;
};

export function PaymentMethodCard() {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/profile/payment-method-status");
    if (!response.ok) throw new Error("Impossible de charger le moyen de paiement.");
    setStatus(await response.json());
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Erreur de chargement"));
  }, []);

  async function removePaymentMethod() {
    if (!window.confirm("Retirer cette carte pour les opérations futures ? Les commissions déjà dues resteront à régler.")) return;
    setRemoving(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/payment-method", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Impossible de retirer la carte.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de retirer la carte.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-winelio-orange">Paiements</p>
          <h3 className="mt-1 text-lg font-bold text-winelio-dark">Carte de commission</h3>
          {!status ? (
            <p className="mt-2 text-sm text-winelio-gray">Chargement…</p>
          ) : status.hasPaymentMethod ? (
            <>
              <p className="mt-2 text-sm font-semibold text-winelio-dark">
                {status.brand?.toUpperCase() ?? "Carte"} •••• {status.last4 ?? "—"}
              </p>
              <p className={`mt-1 text-xs ${status.hasCurrentOffSessionConsent ? "text-emerald-700" : "text-amber-700"}`}>
                {status.hasCurrentOffSessionConsent
                  ? "Débits automatiques autorisés"
                  : "Nouvelle autorisation requise"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-winelio-gray">Aucune carte enregistrée.</p>
          )}
        </div>
        <span className="text-2xl" aria-hidden="true">💳</span>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-xl bg-winelio-orange px-4 py-2.5 text-sm font-bold text-white"
        >
          {status?.hasPaymentMethod ? "Remplacer ou réautoriser" : "Enregistrer une carte"}
        </button>
        {status?.hasPaymentMethod && (
          <button
            type="button"
            onClick={removePaymentMethod}
            disabled={removing}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-winelio-gray disabled:opacity-50"
          >
            {removing ? "Retrait…" : "Retirer la carte"}
          </button>
        )}
      </div>

      <SavePaymentMethodDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          refresh().catch((err) => setError(err instanceof Error ? err.message : "Erreur de chargement"));
        }}
      />
    </section>
  );
}
