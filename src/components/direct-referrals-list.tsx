"use client";

import Link from "next/link";
import { useState } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { DirectReferralProfileCard } from "@/components/direct-referral-profile-card";
import { PendingReferralBadge } from "@/components/pending-referral-badge";
import { isPendingReferral } from "@/lib/pending-referral";
import { formatDisplayName } from "@/lib/utils";

export type DirectReferralListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  city: string | null;
  createdDateLabel: string;
  isProfessional: boolean;
  isDemo: boolean;
  onboardingStatus: string;
  companyCategory: string | null;
  companyCity: string | null;
  subReferrals: number;
  totalCommissions: number;
};

export const DirectReferralsList = ({ referrals }: { referrals: DirectReferralListItem[] }) => {
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);

  if (referrals.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-winelio-orange/10 to-winelio-amber/10">
          <svg className="h-7 w-7 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">Aucun filleul direct pour le moment.</p>
        <p className="mt-1 text-xs text-muted-foreground/60">Partagez votre code parrain !</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Membres rattachés directement à votre compte (niveau 1)</p>
        <Link href="/network/stats" className="shrink-0 text-sm font-medium text-winelio-orange transition-colors hover:text-winelio-amber">Voir tout</Link>
      </div>
      <div className="space-y-2">
        {referrals.map((referral) => {
          const displayName = formatDisplayName(referral.firstName, referral.lastName, "Sans nom");
          const isPending = isPendingReferral(referral.onboardingStatus);
          const location = referral.isProfessional
            ? [referral.companyCategory, referral.companyCity ?? referral.city].filter(Boolean).join(" · ")
            : referral.city;

          return (
            <div key={referral.id} role="button" tabIndex={0} onClick={() => setSelectedReferralId(referral.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedReferralId(referral.id); }} className={`flex cursor-pointer flex-col gap-3 rounded-xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-winelio-orange sm:flex-row sm:items-center sm:justify-between sm:p-4 ${isPending ? "border-violet-200 bg-violet-50/80" : "border-transparent bg-muted/50 hover:bg-muted"}`}>
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar name={displayName} avatar={referral.avatar} className="h-9 w-9" initialsClassName="text-[11px]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-winelio-dark">
                    {displayName}
                    {referral.isProfessional && <span className="ml-1.5 inline-flex items-center rounded bg-gradient-to-r from-winelio-orange to-winelio-amber px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wider text-white">Pro</span>}
                    {referral.isDemo && <span className="ml-1.5 inline-flex items-center rounded border border-orange-100 bg-orange-50 px-1 py-0.5 text-[9px] font-semibold text-orange-400">demo</span>}
                    {isPending && <span className="ml-1.5"><PendingReferralBadge referralId={referral.id} /></span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {location && <span className="mr-1">{location} ·</span>}
                    {referral.createdDateLabel}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {referral.email && <a href={`mailto:${referral.email}`} onClick={(event) => event.stopPropagation()} className="max-w-56 truncate font-medium text-winelio-orange hover:underline">{referral.email}</a>}
                    {referral.phone && <a href={`tel:${referral.phone}`} onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 font-medium text-winelio-dark hover:text-winelio-orange"><span aria-hidden="true">☎</span> Appeler · {referral.phone}</a>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4 sm:ml-2 sm:gap-6">
                <div className="text-center">
                  <p className="text-sm font-bold tabular-nums text-winelio-dark">{referral.subReferrals}</p>
                  <p className="text-[10px] text-muted-foreground">filleuls</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold tabular-nums text-winelio-orange">{referral.totalCommissions.toFixed(2)} €</p>
                  <p className="text-[10px] text-muted-foreground">commissions</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <DirectReferralProfileCard referralId={selectedReferralId} open={Boolean(selectedReferralId)} onOpenChange={(open) => { if (!open) setSelectedReferralId(null); }} />
    </div>
  );
};
