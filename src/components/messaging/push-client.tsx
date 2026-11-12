"use client";

import { useEffect } from "react";

export type NativePushBridgeResult = {
  status: "granted" | "denied" | "unavailable" | "error";
  platform?: "ios" | "android";
  token?: string;
  message?: string;
};

declare global {
  interface Window {
    __WINELIO_NATIVE_APP__?: { platform: "ios" | "android" };
    __WINELIO_REQUEST_PUSH_TOKEN__?: (prompt: boolean) => Promise<NativePushBridgeResult>;
  }
}

const LOCAL_OPTOUT_KEY = "winelio_device_push_disabled";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isNativeMobileShell(): boolean {
  return typeof window !== "undefined" && Boolean(window.__WINELIO_NATIVE_APP__);
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !isNativeMobileShell() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Active ou synchronise les notifications Push sur l'appareil courant (iPhone, Android ou Navigateur).
 */
export async function enableCurrentDevicePush(options: {
  prompt: boolean;
}): Promise<{ ok: boolean; status: string; message?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, status: "unavailable" };
  }

  // 1. Application native iPhone / Android (WebView Winelio)
  if (isNativeMobileShell()) {
    if (typeof window.__WINELIO_REQUEST_PUSH_TOKEN__ !== "function") {
      return {
        ok: false,
        status: "needs_app_update",
        message:
          "Mettez à jour l'application Winelio sur votre téléphone pour activer les notifications natives.",
      };
    }

    const res = await window.__WINELIO_REQUEST_PUSH_TOKEN__(options.prompt);
    if (res.status !== "granted" || !res.token || !res.platform) {
      return {
        ok: false,
        status: res.status,
        message:
          res.status === "denied"
            ? "Les notifications sont désactivées dans les réglages système de votre téléphone."
            : res.message,
      };
    }

    const apiRes = await fetch("/api/notifications/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: res.platform,
        token: res.token,
        label: res.platform === "ios" ? "iPhone" : "Android",
      }),
    });
    if (!apiRes.ok) {
      return { ok: false, status: "error", message: "Enregistrement de l'appareil impossible." };
    }
    try {
      window.localStorage.removeItem(LOCAL_OPTOUT_KEY);
    } catch {
      /* ignore storage errors */
    }
    return { ok: true, status: "granted" };
  }

  // 2. Navigateur / PWA (Web Push W3C)
  if (!isWebPushSupported()) {
    return {
      ok: false,
      status: "unavailable",
      message:
        "Sur iPhone hors application, installez l'application Winelio ou ajoutez Winelio sur l'écran d'accueil pour recevoir les notifications.",
    };
  }

  let permission = Notification.permission;
  if (permission === "default" && options.prompt) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      status: permission,
      message:
        permission === "denied"
          ? "Autorisez les notifications pour Winelio dans les réglages de votre navigateur."
          : undefined,
    };
  }

  const infoRes = await fetch("/api/notifications/devices", { cache: "no-store" });
  if (!infoRes.ok) {
    return { ok: false, status: "error", message: "Service de notifications indisponible." };
  }
  const { vapidPublicKey } = (await infoRes.json()) as { vapidPublicKey?: string };
  if (!vapidPublicKey) {
    return { ok: false, status: "error", message: "Clé de notification manquante." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const saveRes = await fetch("/api/notifications/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: "web",
      subscription: subscription.toJSON(),
      label: /Android|iPhone|iPad/i.test(navigator.userAgent)
        ? "Navigateur mobile"
        : "Navigateur",
    }),
  });

  if (!saveRes.ok) {
    return { ok: false, status: "error", message: "Impossible d'activer cet appareil." };
  }

  try {
    window.localStorage.removeItem(LOCAL_OPTOUT_KEY);
  } catch {
    /* ignore storage errors */
  }
  return { ok: true, status: "granted" };
}

/**
 * Désactive les notifications Push uniquement sur l'appareil courant.
 */
export async function disableCurrentDevicePush(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_OPTOUT_KEY, "1");
  } catch {
    /* ignore */
  }

  if (isNativeMobileShell() && typeof window.__WINELIO_REQUEST_PUSH_TOKEN__ === "function") {
    const res = await window.__WINELIO_REQUEST_PUSH_TOKEN__(false);
    if (res.token) {
      await fetch("/api/notifications/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: res.token }),
      }).catch(() => undefined);
    }
    return;
  }

  if (isWebPushSupported()) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => undefined);
      await fetch("/api/notifications/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
    }
  }
}

export async function isCurrentDeviceSubscribed(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(LOCAL_OPTOUT_KEY) === "1") return false;
  } catch {
    /* ignore */
  }

  if (isNativeMobileShell()) {
    if (typeof window.__WINELIO_REQUEST_PUSH_TOKEN__ !== "function") return false;
    const res = await window.__WINELIO_REQUEST_PUSH_TOKEN__(false);
    return res.status === "granted" && Boolean(res.token);
  }

  if (isWebPushSupported() && Notification.permission === "granted") {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return Boolean(sub);
  }

  return false;
}

/**
 * Composant silencieux monté dans l'espace authentifié :
 * - Sur iPhone / Android natif : enregistre automatiquement le téléphone à la première connexion (tout activé par défaut).
 * - Sur Navigateur : resynchronise l'abonnement Web Push si l'utilisateur l'a déjà autorisé.
 */
export function PushDeviceBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (window.localStorage.getItem(LOCAL_OPTOUT_KEY) === "1") return;
      } catch {
        /* ignore */
      }

      if (isNativeMobileShell()) {
        // Sur l'app iPhone / Android, la demande native s'affiche proprement dès la première arrivée
        await enableCurrentDevicePush({ prompt: true });
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent("winelio:device-push-synced"));
        }
        return;
      }

      if (isWebPushSupported() && Notification.permission === "granted") {
        await enableCurrentDevicePush({ prompt: false });
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent("winelio:device-push-synced"));
        }
      }
    };

    void run();
    const onNativeReady = () => {
      void run();
    };
    window.addEventListener("winelio:native-ready", onNativeReady);
    return () => {
      cancelled = true;
      window.removeEventListener("winelio:native-ready", onNativeReady);
    };
  }, []);

  return null;
}
