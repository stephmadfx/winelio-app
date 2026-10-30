import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { getNationalFeed } from "@/lib/national-feed";
import { ActivityTimeline } from "@/components/activity-timeline";

export const metadata: Metadata = { title: "Toute l’activité — Winelio" };
export default async function ActivityPage() {
  const user = await getUser();
  if (!user) redirect("/auth/login");
  const client = await createClient();
  let failed = false;
  const events = await getNationalFeed(client).catch(() => { failed = true; return []; });
  return <Suspense fallback={<p role="status" className="py-6 text-sm text-muted-foreground">Chargement des actualités…</p>}><ActivityTimeline initialEvents={events} initialError={failed} initialNow={new Date().toISOString()} demoMode={process.env.NEXT_PUBLIC_DEMO_MODE === "true"} /></Suspense>;
}
