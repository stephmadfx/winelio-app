"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

let cachedCount = 0;
let lastFetchedAt = 0;
let inflight: Promise<number> | null = null;
const listeners = new Set<(count: number) => void>();

async function fetchUnreadSummary(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastFetchedAt < 8_000) {
    return cachedCount;
  }
  if (inflight) return inflight;

  inflight = fetch("/api/messaging/channels?summary=1", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) return cachedCount;
      const data = (await res.json()) as { unreadCount?: number; inAppBadges?: boolean };
      const next = data.inAppBadges === false ? 0 : Number(data.unreadCount ?? 0);
      cachedCount = next;
      lastFetchedAt = Date.now();
      for (const fn of listeners) fn(next);
      return next;
    })
    .catch(() => cachedCount)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function notifyMessagingSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("winelio:messaging-sync"));
}

export function useMessagingUnread(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(cachedCount);

  useEffect(() => {
    listeners.add(setCount);
    void fetchUnreadSummary(false);

    const onSync = () => {
      void fetchUnreadSummary(true);
    };
    const onFocus = () => {
      void fetchUnreadSummary(false);
    };

    window.addEventListener("winelio:messaging-sync", onSync);
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchUnreadSummary(true);
      }
    }, 60_000);

    return () => {
      listeners.delete(setCount);
      window.removeEventListener("winelio:messaging-sync", onSync);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void fetchUnreadSummary(false);
  }, [pathname]);

  return count;
}
