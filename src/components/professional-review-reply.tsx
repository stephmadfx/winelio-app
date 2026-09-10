"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateReviewComment } from "@/lib/review-validation";

export function ProfessionalReviewReply({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button className="mt-3 text-sm text-winelio-orange underline" onClick={() => setOpen(true)}>Répondre au commentaire</button>;
  return <form className="mt-4 space-y-3" onSubmit={async event => {
    event.preventDefault();
    const validation = validateReviewComment(comment);
    if (!validation.ok) { setError(validation.errors.join(" ")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reviews/${reviewId}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      router.refresh(); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur réseau."); }
    finally { setBusy(false); }
  }}>
    <label className="block text-sm font-semibold">Votre réponse publique
      <textarea required disabled={busy} maxLength={5000} rows={4} value={comment} onChange={event => setComment(event.target.value)} className="mt-2 w-full rounded-xl border p-3 text-gray-900" />
    </label>
    <p className="text-xs text-gray-500">{comment.length}/5 000 caractères · Sans liens. Une seule réponse, sans possibilité de modification ou de discussion.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy} className="rounded-xl bg-winelio-orange px-4 py-2 text-white disabled:opacity-50">{busy ? "Publication…" : "Publier ma réponse"}</button>
  </form>;
}
