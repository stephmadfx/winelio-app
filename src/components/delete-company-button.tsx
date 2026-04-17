"use client";

import { useState } from "react";
import { deleteCompany } from "@/lib/company-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function DeleteCompanyButton({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    const result = await deleteCompany(companyId);

    if (result.error) {
      setError("Erreur lors de la suppression. Veuillez réessayer.");
      setLoading(false);
      return;
    }

    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
      >
        Supprimer
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Supprimer l&apos;entreprise</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de supprimer{" "}
              <span className="font-semibold text-winelio-dark">
                {companyName}
              </span>
              . Cette action peut être annulée ultérieurement par notre équipe.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <DialogFooter className="flex-row justify-end gap-3">
            <button
              onClick={() => setOpen(false)}
              disabled={loading}
              className="px-4 py-2.5 border border-gray-200 text-winelio-gray font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2.5 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors text-sm disabled:opacity-50"
            >
              {loading ? "Suppression…" : "Confirmer la suppression"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
