"use client";

import { useActionState } from "react";
import { completeAccountingDrafts } from "@/lib/accounting-actions";

export function AccountingDraftsForm() {
  const [state,action,pending] = useActionState(completeAccountingDrafts,{ message:"",error:false });
  return <form action={action} className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="mb-3">Des coordonnées manquent. Complétez-les, puis actualisez pour émettre vos documents. Aucun numéro officiel n’est attribué avant cette étape.</p>
    <button type="submit" disabled={pending} aria-busy={pending} aria-label="Actualiser les documents à compléter" className="rounded-lg bg-winelio-orange px-4 py-2 font-medium text-white disabled:opacity-60">
      {pending ? "Actualisation…" : "Actualiser les documents à compléter"}
    </button>
    {state.message && <p role={state.error ? "alert" : "status"} className="mt-3">{state.message}</p>}
  </form>;
}
