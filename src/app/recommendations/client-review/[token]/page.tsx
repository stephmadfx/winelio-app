"use client";
import { use, useEffect, useState } from "react";
import { ReviewForm } from "@/components/review-form";
import { WinelioLogo } from "@/components/winelio-logo";

type Context = { alreadyReviewed: boolean; professionalName: string; professionalId: string; affiliationUrl: string | null };
export default function ClientReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Context | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/recommendations/client-review?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then(body => { if (active) setData(body); }).catch(err => { if (active) setError(err.message || "Impossible de charger la page."); });
    return () => { active = false; };
  }, [token]);
  return <main className="min-h-screen bg-winelio-light px-5 py-12 text-winelio-dark"><div className="mx-auto max-w-xl space-y-7 rounded-2xl bg-white p-6 shadow-sm sm:p-10">
    <WinelioLogo height={38} />
    <h1 className="text-2xl font-bold">Votre avis sur {data?.professionalName ?? "le professionnel"}</h1>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Chargement…</p> : <>
      <p>Votre avis est facultatif. Vous pouvez le déposer sans créer de compte.</p>
      {data.alreadyReviewed ? <p role="status">Merci, votre avis a déjà été enregistré.</p> : <ReviewForm endpoint="/api/recommendations/client-review" token={token} />}
      <a className="block text-sm text-winelio-orange underline" href={`/professionnels/${data.professionalId}/avis`}>Voir les avis du professionnel</a>
      {data.affiliationUrl && <aside className="border-t pt-5"><h2 className="font-semibold">Envie de rejoindre Winelio ?</h2><p className="my-2 text-sm">Recommandez à votre tour des professionnels et rejoignez le réseau de votre parrain.</p><a className="text-winelio-orange underline" href={data.affiliationUrl}>M’affilier à Winelio</a></aside>}
    </>}
  </div></main>;
}
