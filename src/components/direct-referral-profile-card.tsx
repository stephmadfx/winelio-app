"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProfileAvatar } from "@/components/profile-avatar";
import { PendingReferralBadge } from "@/components/pending-referral-badge";
import { isPendingReferral } from "@/lib/pending-referral";
import { formatDisplayName } from "@/lib/utils";

type ReferralDetails = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  createdAt: string;
  isProfessional: boolean;
  isDemo: boolean;
  onboardingStatus: string;
  companyName: string | null;
  companyCity: string | null;
  companyCategory: string | null;
  referralCount: number;
  totalCommissions: number;
};

export function DirectReferralProfileCard({
  referralId,
  open,
  onOpenChange,
}: {
  referralId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [details, setDetails] = useState<ReferralDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !referralId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDetails(null);
    fetch(`/api/network/direct-referral-details?referralId=${encodeURIComponent(referralId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Fiche indisponible.");
        setDetails(result);
      })
      .catch((fetchError) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "Fiche indisponible.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, referralId]);

  const name = details ? formatDisplayName(details.firstName, details.lastName, "Sans nom") : "Fiche du filleul";
  const pending = isPendingReferral(details?.onboardingStatus);
  const location = details ? [details.postalCode, details.city].filter(Boolean).join(" ") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-0 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>Informations complètes du filleul direct</DialogDescription>
        </DialogHeader>

        {loading && <div className="flex min-h-72 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-3 border-winelio-orange border-t-transparent" /></div>}
        {error && <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {details && !loading && (
          <div>
            <div className="relative overflow-hidden bg-winelio-dark px-6 pb-6 pt-8 text-white">
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-winelio-orange/20 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <ProfileAvatar name={name} avatar={details.avatar} className="h-16 w-16 border-2 border-white/30 shadow-xl" initialsClassName="text-lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-bold">{name}</h2>
                    {details.isProfessional && <span className="rounded bg-winelio-orange px-2 py-0.5 text-[10px] font-bold uppercase">Pro</span>}
                  </div>
                  <p className="mt-1 text-xs text-white/65">Filleul direct · Niveau 1</p>
                  <div className="mt-2">{pending ? <PendingReferralBadge referralId={details.id} /> : <span className="inline-flex rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-200">Compte actif</span>}</div>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <section>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-winelio-gray">Coordonnées</h3>
                <div className="grid gap-2">
                  {details.email ? <a href={`mailto:${details.email}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-winelio-light p-3 transition hover:border-winelio-orange/40"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-winelio-orange">✉</span><span className="min-w-0"><small className="block text-[10px] uppercase text-winelio-gray">E-mail</small><strong className="block truncate text-sm text-winelio-dark">{details.email}</strong></span></a> : null}
                  {details.phone ? <a href={`tel:${details.phone}`} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-winelio-light p-3 transition hover:border-winelio-orange/40"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-winelio-orange">☎</span><span><small className="block text-[10px] uppercase text-winelio-gray">Téléphone</small><strong className="block text-sm text-winelio-dark">{details.phone}</strong></span><span className="ml-auto rounded-lg bg-winelio-orange px-3 py-1.5 text-xs font-bold text-white">Appeler</span></a> : null}
                  {(details.address || location) && <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-winelio-light p-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-winelio-orange">⌖</span><span><small className="block text-[10px] uppercase text-winelio-gray">Adresse</small><strong className="block text-sm text-winelio-dark">{[details.address, location].filter(Boolean).join(", ")}</strong></span></div>}
                </div>
              </section>

              {details.isProfessional && (details.companyName || details.companyCategory) && (
                <section className="rounded-xl border-l-4 border-winelio-orange bg-orange-50 p-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-winelio-orange">Activité professionnelle</h3>
                  <p className="mt-1 font-bold text-winelio-dark">{details.companyName || details.companyCategory}</p>
                  <p className="text-xs text-winelio-gray">{[details.companyCategory, details.companyCity].filter(Boolean).join(" · ")}</p>
                </section>
              )}

              <section className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-muted p-3 text-center"><strong className="block text-lg text-winelio-dark">{details.referralCount}</strong><span className="text-[10px] text-winelio-gray">Filleuls</span></div>
                <div className="rounded-xl bg-orange-50 p-3 text-center"><strong className="block text-lg text-winelio-orange">{details.totalCommissions.toFixed(2)} €</strong><span className="text-[10px] text-winelio-gray">Commissions</span></div>
                <div className="rounded-xl bg-muted p-3 text-center"><strong className="block text-sm text-winelio-dark">{new Date(details.createdAt).toLocaleDateString("fr-FR")}</strong><span className="text-[10px] text-winelio-gray">Inscription</span></div>
              </section>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
