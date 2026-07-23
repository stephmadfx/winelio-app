"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PENDING_REFERRAL_HELP } from "@/lib/pending-referral";
import {
  buildMailtoUri,
  buildPendingReminderMessage,
  buildPendingReminderSubject,
  buildSmsUri,
} from "@/lib/pending-referral-reminder";

type Contact = { firstName: string; lastName: string; email: string; phone: string };

export function PendingReferralBadge({
  compact = false,
  referralId,
}: {
  compact?: boolean;
  referralId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const interactive = Boolean(referralId);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const openReminder = async () => {
    if (!referralId) return;
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/network/pending-referral-contact?referralId=${encodeURIComponent(referralId)}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Coordonnées indisponibles.");
      setContact(result);
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : "Coordonnées indisponibles.");
    } finally {
      setLoading(false);
    }
  };

  const launchSms = () => {
    if (!contact?.phone) return;
    const message = buildPendingReminderMessage(contact.firstName);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    window.location.href = buildSmsUri(contact.phone, message, isIOS);
  };

  const launchEmail = () => {
    if (!contact?.email) return;
    const message = buildPendingReminderMessage(contact.firstName);
    window.location.href = buildMailtoUri(contact.email, buildPendingReminderSubject(), message);
  };

  return (
    <>
      <span className="group relative inline-flex shrink-0 align-middle">
        <button
          type="button"
          disabled={!interactive}
          onClick={(event) => { event.stopPropagation(); void openReminder(); }}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          aria-label={interactive ? `${PENDING_REFERRAL_HELP} Appuyer pour relancer.` : PENDING_REFERRAL_HELP}
          data-testid={referralId ? `pending-referral-${referralId}` : undefined}
          className={`inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-100 font-bold text-violet-700 outline-none ring-violet-300 focus:ring-2 disabled:cursor-help ${
            compact ? "h-4 px-1.5 text-[8px]" : "px-2 py-0.5 text-[9px]"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          En attente
        </button>
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-[80] mb-2 hidden w-60 -translate-x-1/2 rounded-lg bg-winelio-dark px-3 py-2 text-left text-[10px] font-medium leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block">
          {interactive ? `${PENDING_REFERRAL_HELP} Appuyez pour envoyer un rappel.` : PENDING_REFERRAL_HELP}
        </span>
      </span>

      {open && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={(event) => { event.stopPropagation(); setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="pending-reminder-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="pending-reminder-title" className="text-base font-bold text-winelio-dark">Relancer le filleul</h2>
                <p className="mt-1 text-xs leading-relaxed text-winelio-gray">Choisissez l’application à ouvrir avec un message déjà préparé.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-lg text-winelio-gray">×</button>
            </div>

            {loading && <p className="mt-5 text-center text-sm text-winelio-gray">Chargement des coordonnées…</p>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            {contact && !loading && (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-semibold text-winelio-dark">{[contact.firstName, contact.lastName].filter(Boolean).join(" ")}</p>
                <button type="button" onClick={launchSms} disabled={!contact.phone} data-testid="pending-reminder-sms" className="flex w-full items-center gap-3 rounded-xl bg-emerald-500 px-4 py-3 text-left text-white disabled:opacity-40">
                  <span className="text-xl">💬</span><span><strong className="block text-sm">Relancer par SMS</strong><small className="block text-[10px] opacity-90">{contact.phone || "Numéro indisponible"}</small></span>
                </button>
                <button type="button" onClick={launchEmail} disabled={!contact.email} data-testid="pending-reminder-email" className="flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber px-4 py-3 text-left text-white disabled:opacity-40">
                  <span className="text-xl">✉️</span><span className="min-w-0"><strong className="block text-sm">Relancer par e-mail</strong><small className="block truncate text-[10px] opacity-90">{contact.email || "E-mail indisponible"}</small></span>
                </button>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
