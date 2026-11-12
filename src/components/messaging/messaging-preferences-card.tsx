"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { notifyMessagingSync } from "./use-messaging-unread";
import {
  disableCurrentDevicePush,
  enableCurrentDevicePush,
  isCurrentDeviceSubscribed,
  isNativeMobileShell,
  isWebPushSupported,
} from "./push-client";

type PrefState = {
  notify_official_announcements: boolean;
  notify_community_messages: boolean;
  notify_message_replies: boolean;
  notify_new_referral: boolean;
  in_app_badges: boolean;
};

const PREFS_UPDATED_EVENT = "winelio:notification-prefs-updated";

export function MessagingPreferencesCard() {
  const baseId = useId();
  const [prefs, setPrefs] = useState<PrefState | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);

  const [deviceReady, setDeviceReady] = useState(false);
  const [deviceActive, setDeviceActive] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceNote, setDeviceNote] = useState("");
  const [canPromptDevice, setCanPromptDevice] = useState(false);

  const refreshDeviceStatus = useCallback(async () => {
    const supported = isNativeMobileShell() || isWebPushSupported();
    setCanPromptDevice(supported);
    const active = await isCurrentDeviceSubscribed();
    setDeviceActive(active);
    setDeviceReady(true);
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/messaging/preferences", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Partial<PrefState>;
      setPrefs({
        notify_official_announcements: data.notify_official_announcements !== false,
        notify_community_messages: data.notify_community_messages !== false,
        notify_message_replies: data.notify_message_replies !== false,
        notify_new_referral: data.notify_new_referral !== false,
        in_app_badges: data.in_app_badges !== false,
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    void refreshDeviceStatus();

    const onPrefsUpdated = () => {
      void load();
    };
    const onDeviceSynced = () => {
      void refreshDeviceStatus();
    };
    window.addEventListener(PREFS_UPDATED_EVENT, onPrefsUpdated);
    window.addEventListener("winelio:device-push-synced", onDeviceSynced);
    return () => {
      window.removeEventListener(PREFS_UPDATED_EVENT, onPrefsUpdated);
      window.removeEventListener("winelio:device-push-synced", onDeviceSynced);
    };
  }, [load, refreshDeviceStatus]);

  async function save(nextPrefs?: PrefState) {
    const target = nextPrefs ?? prefs;
    if (!target) return;
    setBusy(true);
    setFeedback("");
    try {
      const res = await fetch("/api/messaging/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      if (!res.ok) throw new Error();
      notifyMessagingSync();
      window.dispatchEvent(new CustomEvent(PREFS_UPDATED_EVENT));
      setFeedback("Vos préférences de notifications ont été enregistrées.");
    } catch {
      setFeedback("Enregistrement impossible. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDevice() {
    setDeviceBusy(true);
    setDeviceNote("");
    try {
      if (deviceActive) {
        await disableCurrentDevicePush();
        setDeviceActive(false);
        setDeviceNote("Notifications désactivées sur cet appareil.");
      } else {
        const res = await enableCurrentDevicePush({ prompt: true });
        if (res.ok) {
          setDeviceActive(true);
          setDeviceNote("Cet appareil recevra désormais vos notifications Winelio.");
        } else if (res.message) {
          setDeviceNote(res.message);
        }
      }
    } finally {
      setDeviceBusy(false);
    }
  }

  return (
    <Card id="messaging-preferences" className="!rounded-2xl mb-4">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-winelio-dark flex items-center gap-2">
              <svg
                className="w-5 h-5 text-winelio-orange shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.7}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
                />
              </svg>
              Notifications téléphone &amp; e-mail
            </h3>
            <p className="text-sm text-winelio-gray mt-1">
              Toutes les alertes sont activées par défaut. Décochez librement celles que vous ne souhaitez plus recevoir.
            </p>
          </div>

          {deviceReady && canPromptDevice && (
            <button
              type="button"
              onClick={() => void handleToggleDevice()}
              disabled={deviceBusy}
              aria-pressed={deviceActive}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-50 ${
                deviceActive
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                  : "bg-winelio-orange/10 text-winelio-orange border border-winelio-orange/30 hover:bg-winelio-orange/15"
              }`}
            >
              {deviceBusy
                ? "Patientez…"
                : deviceActive
                ? "📱 Actif sur cet appareil · Désactiver"
                : "🔔 Activer sur cet appareil"}
            </button>
          )}
        </div>

        {deviceNote && (
          <p role="status" className="text-xs text-winelio-orange font-medium">
            {deviceNote}
          </p>
        )}

        {failed ? (
          <p role="alert" className="text-sm text-red-600">
            Préférences indisponibles.{" "}
            <button type="button" onClick={() => void load()} className="underline font-medium">
              Réessayer
            </button>
          </p>
        ) : !prefs ? (
          <p role="status" className="text-sm text-winelio-gray">
            Chargement…
          </p>
        ) : (
          <fieldset disabled={busy} className="space-y-1 divide-y divide-gray-100">
            <legend className="sr-only">Choix des notifications Winelio</legend>

            <label
              htmlFor={`${baseId}-official`}
              className="winelio-checkbox-label py-2.5 text-sm"
            >
              <input
                id={`${baseId}-official`}
                type="checkbox"
                checked={prefs.notify_official_announcements}
                onChange={(e) => {
                  setFeedback("");
                  setPrefs({ ...prefs, notify_official_announcements: e.target.checked });
                }}
                className="winelio-checkbox"
              />
              <span>
                <strong className="font-semibold text-winelio-dark block">
                  📢 Annonces officielles Winelio
                </strong>
                <span className="text-xs text-winelio-gray">
                  Recevoir une alerte téléphone et e-mail lors d’une annonce officielle importante du réseau.
                </span>
              </span>
            </label>

            <label
              htmlFor={`${baseId}-community`}
              className="winelio-checkbox-label py-2.5 text-sm"
            >
              <input
                id={`${baseId}-community`}
                type="checkbox"
                checked={prefs.notify_community_messages}
                onChange={(e) => {
                  setFeedback("");
                  setPrefs({ ...prefs, notify_community_messages: e.target.checked });
                }}
                className="winelio-checkbox"
              />
              <span>
                <strong className="font-semibold text-winelio-dark block">
                  💬 Nouveaux messages de la communauté
                </strong>
                <span className="text-xs text-winelio-gray">
                  Recevoir une notification sur le téléphone lorsqu’un membre publie un nouveau message (hors messages automatiques de bienvenue).
                </span>
              </span>
            </label>

            <label
              htmlFor={`${baseId}-replies`}
              className="winelio-checkbox-label py-2.5 text-sm"
            >
              <input
                id={`${baseId}-replies`}
                type="checkbox"
                checked={prefs.notify_message_replies}
                onChange={(e) => {
                  setFeedback("");
                  setPrefs({ ...prefs, notify_message_replies: e.target.checked });
                }}
                className="winelio-checkbox"
              />
              <span>
                <strong className="font-semibold text-winelio-dark block">
                  ↩️ Réponses à mes messages
                </strong>
                <span className="text-xs text-winelio-gray">
                  Être prévenu sur le téléphone lorsqu’un membre commente l’une de mes publications.
                </span>
              </span>
            </label>

            <label
              htmlFor={`${baseId}-referral`}
              className="winelio-checkbox-label py-2.5 text-sm"
            >
              <input
                id={`${baseId}-referral`}
                type="checkbox"
                checked={prefs.notify_new_referral}
                onChange={(e) => {
                  setFeedback("");
                  setPrefs({ ...prefs, notify_new_referral: e.target.checked });
                }}
                className="winelio-checkbox"
              />
              <span>
                <strong className="font-semibold text-winelio-dark block">
                  🌱 Nouveau filleul dans mon réseau
                </strong>
                <span className="text-xs text-winelio-gray">
                  Être averti sur le téléphone et par e-mail dès qu’un nouveau filleul rejoint mon réseau (niveaux 1 à 5).
                </span>
              </span>
            </label>

            <label
              htmlFor={`${baseId}-badges`}
              className="winelio-checkbox-label py-2.5 text-sm"
            >
              <input
                id={`${baseId}-badges`}
                type="checkbox"
                checked={prefs.in_app_badges}
                onChange={(e) => {
                  setFeedback("");
                  setPrefs({ ...prefs, in_app_badges: e.target.checked });
                }}
                className="winelio-checkbox"
              />
              <span>
                <strong className="font-semibold text-winelio-dark block">
                  🔴 Pastille de nouveautés dans le menu
                </strong>
                <span className="text-xs text-winelio-gray">
                  Afficher le badge orange sur l’onglet Messagerie lorsqu’un nouveau message n’a pas encore été lu.
                </span>
              </span>
            </label>

            <div className="pt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:opacity-95 transition cursor-pointer disabled:opacity-50"
              >
                {busy ? "Enregistrement…" : "Enregistrer mes notifications"}
              </button>
              {feedback && (
                <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {feedback}
                </p>
              )}
            </div>
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
