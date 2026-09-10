"use client";
import { useState } from "react";
import { REVIEW_QUESTION, validateRecommendationReview } from "@/lib/review-validation";

export function ReviewForm({ endpoint, token, onSuccess }: { endpoint: string; token?: string; onSuccess?: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">Merci, votre avis a été enregistré.</p>;
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    const validation = validateRecommendationReview(rating, comment);
    if (!validation.ok) { setError(validation.errors.join(" ")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment, token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Impossible d’enregistrer votre avis.");
      setDone(true); onSuccess?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur réseau. Réessayez."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy}><legend className="mb-2 font-semibold">{REVIEW_QUESTION}</legend>
      <div className="flex gap-2">{[1,2,3,4,5].map(star => <label key={star} className="relative inline-flex h-11 w-11 cursor-pointer items-center justify-center text-3xl">
        <input className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" type="radio" name="rating" value={star} checked={rating === star} onChange={() => setRating(star)} required aria-label={`${star} étoile${star > 1 ? "s" : ""}`} />
        <span className={`pointer-events-none rounded peer-focus-visible:outline peer-focus-visible:outline-2 ${star <= rating ? "text-amber-500" : "text-gray-300"}`} aria-hidden="true">★</span>
      </label>)}</div>
      <p className="mt-1 text-xs text-gray-500">1 : Pas du tout · 5 : Sans hésiter</p>
    </fieldset>
    <label className="block">Commentaire facultatif
      <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={5000} rows={5} disabled={busy} className="mt-2 block w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900" aria-describedby="review-comment-help" />
    </label>
    <p id="review-comment-help" className="text-xs text-gray-500">{comment.length}/5 000 caractères · Les liens ne sont pas autorisés. Votre avis sera visible sur la page du professionnel.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <button disabled={busy} className="rounded-xl bg-winelio-orange px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Envoi en cours…" : "Publier mon avis"}</button>
  </form>;
}
