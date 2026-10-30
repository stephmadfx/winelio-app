"use client";
import { useState } from "react";
import { ActivityFeed } from "@/components/activity-feed";
import { FeedPreferences } from "@/components/feed-preferences";
import { NetworkDigest } from "@/components/network-digest";
import { WinelioLogo } from "@/components/winelio-logo";
import type { FeedEvent } from "@/lib/feed-utils";

// Local preview transport. It cannot call the live APIs or write to Supabase.
const previewRequest: typeof fetch = async (input, options) => {
  const url = String(input);
  if (url === "/api/feed/preferences") {
    if (options?.method === "PUT") {
      localStorage.setItem("winelio-feed-preview-preferences", String(options.body));
      return Response.json({ saved: true });
    }
    return Response.json(JSON.parse(localStorage.getItem("winelio-feed-preview-preferences") || '{"share_activity":false,"share_gains":false,"daily_digest_frequency":0}'));
  }
  if (url === "/api/feed/digest") {
    if (options?.method === "DELETE") {
      sessionStorage.setItem("winelio-feed-preview-dismissed", "true");
      return Response.json({ dismissed: true });
    }
    return Response.json({ digest: sessionStorage.getItem("winelio-feed-preview-dismissed") ? null : { id: "40000000-0000-0000-0000-000000000001", created_at: new Date().toISOString() } });
  }
  throw new Error("Cet aperçu utilise uniquement des exemples locaux.");
};
export function FeedPreview({ now }: { now: string }) {
  const [tab, setTab] = useState<"feed" | "settings">("feed");
  const [events] = useState<FeedEvent[]>(() => {
    const ago = (minutes: number) => new Date(Date.parse(now)-minutes*60_000).toISOString();
    return [
      {id:"demo-1",kind:"member_joined",user:"Julie M.",timestamp:ago(3)},
      {id:"demo-2",kind:"member_sponsored",user:"Thierry C.",timestamp:ago(18)},
      {id:"demo-3",kind:"recommendation_created",user:"Thierry C.",timestamp:ago(42)},
      {id:"demo-4",kind:"gain_credited",user:"Sandrine D.",amount:300.25,timestamp:ago(85)},
      {id:"demo-5",kind:"member_joined",user:"Christophe L.",timestamp:ago(150)},
      {id:"demo-6",kind:"gain_credited",user:"Julie M.",amount:120,timestamp:ago(240)},
      {id:"demo-7",kind:"recommendation_created",user:"Antoine F.",timestamp:ago(320)},
    ];
  });
  return <main className="min-h-screen bg-winelio-light p-4 sm:p-8">
    <div className="max-w-3xl mx-auto space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4"><WinelioLogo height={38} /><span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-winelio-orange">Aperçu local · exemples fictifs</span></header>
      <div><h1 className="text-2xl font-bold text-winelio-dark">Les nouvelles actualités Winelio</h1><p className="text-sm text-winelio-gray mt-2">Découvrez le fil national et les réglages de confidentialité. Les choix effectués ici restent dans cet aperçu.</p></div>
      <nav className="flex gap-2" aria-label="Aperçu"><button onClick={() => setTab("feed")} aria-pressed={tab==="feed"} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab==="feed" ? "bg-winelio-orange text-white" : "bg-white text-winelio-dark"}`}>Fil d’actualité</button><button onClick={() => setTab("settings")} aria-pressed={tab==="settings"} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab==="settings" ? "bg-winelio-orange text-white" : "bg-white text-winelio-dark"}`}>Confidentialité et rappels</button></nav>
      {tab==="feed" ? <><div onClickCapture={e=>{const target=(e.target as HTMLElement).closest("a");if(target?.getAttribute("href")==="/settings"){e.preventDefault();e.stopPropagation();setTab("settings");}}}><NetworkDigest request={previewRequest}/><ActivityFeed initialEvents={events} demoMode/></div><p className="text-xs text-winelio-gray">Les montants ci-dessus illustrent des gains crédités. Aucun gain en attente ni montant de dossier n’est affiché.</p></> : <FeedPreferences request={previewRequest}/>}
    </div>
  </main>;
}
