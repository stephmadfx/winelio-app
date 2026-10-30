"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedEvent } from "@/lib/feed-utils";

type Options = { initialEvents: FeedEvent[]; initialError?: boolean; initialNow?: string; demoMode?: boolean; viewport?: "mobile" | "desktop" };
export function useActivityEvents({ initialEvents, initialError = false, initialNow, demoMode = false, viewport }: Options) {
  const [events, setEvents] = useState(initialEvents);
  const [failed, setFailed] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(initialNow ?? new Date().toISOString());
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (demoMode) return;
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setLoading(true);
    try {
      const res = await fetch("/api/feed", { cache: "no-store", signal: current.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!Array.isArray(data.events)) throw new Error();
      if (!current.signal.aborted) { setEvents(data.events); setFailed(false); setNow(new Date().toISOString()); }
    } catch {
      if (!current.signal.aborted) { setEvents([]); setFailed(true); }
    } finally { if (!current.signal.aborted) setLoading(false); }
  }, [demoMode]);
  useEffect(() => {
    controller.current?.abort();
    setEvents(initialEvents); setFailed(initialError); setLoading(false);
    if (initialNow) setNow(initialNow);
  }, [initialEvents, initialError, initialNow]);
  useEffect(() => {
    if (demoMode) return;
    const media = window.matchMedia("(min-width: 1024px)");
    const active = () => !document.hidden && (!viewport || (viewport === "desktop" ? media.matches : !media.matches));
    const resume = () => { if (active()) void refresh(); else { controller.current?.abort(); setLoading(false); } };
    const timer = setInterval(() => { if (active()) void refresh(); }, 30_000);
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume); media.addEventListener("change", resume);
    return () => { clearInterval(timer); controller.current?.abort(); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); media.removeEventListener("change", resume); };
  }, [demoMode, refresh, viewport]);
  return { events, failed, loading, now, refresh };
}
