"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  // État du dialog de suppression
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => setMounted(true), []);

  const openDeleteDialog = () => {
    setDeleteStep(1);
    setConfirmInput("");
    setDeleteError("");
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (confirmInput !== "SUPPRIMER") {
      setDeleteError("Veuillez saisir exactement « SUPPRIMER » pour confirmer.");
      return;
    }
    setDeleting(true);
    setDeleteError("");

    const res = await fetch("/api/account/delete", { method: "POST" });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error || "Une erreur est survenue. Réessayez plus tard.");
      setDeleting(false);
      return;
    }

    // Route serveur pour effacer les cookies httpOnly
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/auth/login");
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-winelio-dark">Paramètres</h2>
        <p className="text-sm text-winelio-gray mt-1">Personnalisez votre expérience</p>
      </div>

      {/* Apparence */}
      <Card className="!rounded-2xl mb-4">
       <CardContent className="p-5 sm:p-6">
        <h3 className="text-base font-semibold text-winelio-dark mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Apparence
        </h3>

        {mounted && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                theme === "light"
                  ? "border-winelio-orange bg-winelio-orange/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="w-full h-16 rounded-lg bg-white border border-gray-200 overflow-hidden shadow-sm">
                <div className="h-4 bg-[#2D3436]" />
                <div className="p-1.5 space-y-1">
                  <div className="h-2 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-winelio-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
                </svg>
                <span className={`text-sm font-medium ${theme === "light" ? "text-winelio-orange" : "text-winelio-gray"}`}>
                  Clair
                </span>
                {theme === "light" && (
                  <svg className="w-4 h-4 text-winelio-orange ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                theme === "dark"
                  ? "border-winelio-orange bg-winelio-orange/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="w-full h-16 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden">
                <div className="h-4 bg-[#2D3436]" />
                <div className="p-1.5 space-y-1">
                  <div className="h-2 bg-slate-700 rounded w-3/4" />
                  <div className="h-2 bg-slate-800 rounded w-1/2" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-winelio-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span className={`text-sm font-medium ${theme === "dark" ? "text-winelio-orange" : "text-winelio-gray"}`}>
                  Sombre
                </span>
                {theme === "dark" && (
                  <svg className="w-4 h-4 text-winelio-orange ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-4">
          Le mode sombre réduit la fatigue oculaire dans les environnements peu éclairés.
        </p>
       </CardContent>
      </Card>

      {/* Infos app */}
      <Card className="!rounded-2xl mb-4">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            À propos
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium text-winelio-dark">Winelio</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium text-winelio-dark">1.0.0</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone dangereuse */}
      <Card className="!rounded-2xl border-red-200">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-red-600 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            Zone dangereuse
          </h3>
          <p className="text-sm text-winelio-gray mb-4">
            La suppression de votre compte est définitive et irréversible.
          </p>
          <button
            onClick={openDeleteDialog}
            className="w-full py-2.5 px-4 rounded-xl border-2 border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
          >
            Supprimer mon compte
          </button>
        </CardContent>
      </Card>

      {/* Dialog de suppression */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <DialogContent className="max-w-md mx-4 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Supprimer mon compte
            </DialogTitle>
          </DialogHeader>

          {deleteStep === 1 && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3 text-sm text-red-800">
                <p className="font-semibold">Avant de continuer, lisez attentivement :</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">•</span>
                    <span>Cette action est <strong>définitive et irréversible</strong>. Votre compte sera supprimé immédiatement.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">•</span>
                    <span>Si vous revenez un jour, vous <strong>ne retrouverez pas votre place actuelle</strong> dans le réseau. Vous devrez repartir de zéro avec un nouveau code parrain.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">•</span>
                    <span>Votre code utilisateur actuel ne sera <strong>jamais réattribué</strong> à un autre compte.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">•</span>
                    <span>Vos filleuls directs <strong>remontent automatiquement</strong> au niveau de votre parrain dans le réseau.</span>
                  </li>
                </ul>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border-2 border-gray-200 text-winelio-gray text-sm font-medium hover:border-gray-300 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => setDeleteStep(2)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Je comprends, continuer
                </button>
              </DialogFooter>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-winelio-gray">
                Pour confirmer la suppression définitive de votre compte, saisissez <strong className="text-winelio-dark">SUPPRIMER</strong> dans le champ ci-dessous :
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => {
                  setConfirmInput(e.target.value);
                  setDeleteError("");
                }}
                placeholder="SUPPRIMER"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-red-400 outline-none text-sm font-mono tracking-widest text-center"
                autoComplete="off"
                autoCapitalize="characters"
                disabled={deleting}
              />
              {deleteError && (
                <p className="text-xs text-red-600 text-center">{deleteError}</p>
              )}
              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={() => { setDeleteStep(1); setConfirmInput(""); setDeleteError(""); }}
                  disabled={deleting}
                  className="flex-1 py-2.5 px-4 rounded-xl border-2 border-gray-200 text-winelio-gray text-sm font-medium hover:border-gray-300 transition-colors disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || confirmInput !== "SUPPRIMER"}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Suppression…" : "Supprimer définitivement"}
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
