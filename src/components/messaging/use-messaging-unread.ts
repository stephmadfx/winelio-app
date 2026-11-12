"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

let cachedCount = 0;
let lastFetchedAt = 0;
let inflight: Promise<number> | null = null;
const listeners = new Set<(count: number) => void>();

let cachedOnlineCount = 0;
let presenceUserId: string | null = null;
let presenceChannel: RealtimeChannel | null = null;
let authListenerBound = false;
const onlineListeners = new Set<(count: number) => void>();

function publishOnlineCount(next: number) {
  cachedOnlineCount = next;
  for (const fn of onlineListeners) fn(next);
}

function teardownCommunityPresence() {
  presenceUserId = null;
  if (presenceChannel) {
    const supabase = createClient();
    const ch = presenceChannel;
    presenceChannel = null;
    void supabase.removeChannel(ch);
  }
  if (cachedOnlineCount !== 0) {
    publishOnlineCount(0);
  }
}

export function ensureCommunityPresence(userId: string | null | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  if (presenceChannel && presenceUserId === userId) return;

  teardownCommunityPresence();
  presenceUserId = userId;

  const supabase = createClient();

  if (!authListenerBound) {
    authListenerBound = true;
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        teardownCommunityPresence();
      }
    });
  }

  const channel = supabase.channel("winelio-community-presence", {
    config: {
      presence: { key: userId },
    },
  });

  presenceChannel = channel;

  const syncFromState = () => {
    if (presenceChannel !== channel) return;
    const uniqueUsers = Object.keys(channel.presenceState()).length;
    publishOnlineCount(uniqueUsers);
  };

  channel
    .on("presence", { event: "sync" }, syncFromState)
    .subscribe((status) => {
      if (status === "SUBSCRIBED" && presenceChannel === channel) {
        void channel.track({ online_at: new Date().toISOString() });
      }
    });
}

async function fetchUnreadSummary(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastFetchedAt < 8_000) {
    return cachedCount;
  }
  if (inflight) return inflight;

  inflight = fetch("/api/messaging/channels?summary=1", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) {
        if (res.status === 401) teardownCommunityPresence();
        return cachedCount;
      }
      const data = (await res.json()) as {
        eligible?: boolean;
        currentUserId?: string;
        unreadCount?: number;
        inAppBadges?: boolean;
      };
      if (data.eligible && data.currentUserId) {
        ensureCommunityPresence(data.currentUserId);
      } else if (data.eligible === false) {
        teardownCommunityPresence();
      }
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

export function useCommunityOnlineCount(): number {
  const [onlineCount, setOnlineCount] = useState(cachedOnlineCount);

  useEffect(() => {
    onlineListeners.add(setOnlineCount);
    setOnlineCount(cachedOnlineCount);
    void fetchUnreadSummary(false);

    return () => {
      onlineListeners.delete(setOnlineCount);
    };
  }, []);

  return onlineCount;
}
