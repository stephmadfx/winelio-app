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

  // État du formulaire mot de passe
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }

    setPasswordLoading(true);
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setPasswordLoading(false);

    if (!res.ok) {
      setPasswordError(data.error || "Une erreur est survenue.");
      return;
    }

    setPasswordSuccess(true);
    setNewPassword("");
    setConfirmPassword("");
  };

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

      {/* Sécurité */}
      <Card className="!rounded-2xl mb-4">
        <CardContent className="p-5 sm:p-6">
          <h3 className="text-base font-semibold text-winelio-dark mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-winelio-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Sécurité
          </h3>
          <p className="text-xs text-winelio-gray mb-4">
            Définissez ou modifiez votre mot de passe pour vous connecter sans code email.
          </p>

          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-sm font-medium text-winelio-dark">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); setPasswordSuccess(false); }}
                  placeholder="8 caractères minimum"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-gray-200 bg-winelio-light/70 px-4 py-2.5 pr-11 text-sm text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-winelio-gray hover:text-winelio-orange transition-colors"
                  tabIndex={-1}
                  aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showNewPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88 6.59 6.59m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-winelio-dark">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); setPasswordSuccess(false); }}
                  placeholder="Répétez le mot de passe"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-gray-200 bg-winelio-light/70 px-4 py-2.5 pr-11 text-sm text-winelio-dark placeholder:text-winelio-gray/60 focus:border-winelio-orange focus:outline-none focus:ring-4 focus:ring-winelio-orange/15"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-winelio-gray hover:text-winelio-orange transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showConfirmPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88 6.59 6.59m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {passwordError && (
              <p className="text-sm text-red-500">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600 font-medium">Mot de passe enregistré avec succès.</p>
            )}

            <button
              type="submit"
              disabled={passwordLoading || !newPassword || !confirmPassword}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white text-sm font-semibold shadow-[0_8px_20px_rgba(255,107,53,0.2)] transition hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {passwordLoading ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </button>
          </form>
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
