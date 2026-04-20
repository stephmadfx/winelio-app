"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProfileIncompleteModal() {
  const pathname = usePathname();

  // Ne pas afficher sur la page profil (l'utilisateur est en train de remplir)
  if (pathname === "/profile") return null;

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 flex flex-col items-center text-center">
        {/* Icône */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center mb-5 shadow-md">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-winelio-dark mb-2">
          Complétez votre profil
        </h2>
        <p className="text-sm text-winelio-gray leading-relaxed mb-6">
          Avant d'accéder à la plateforme, vous devez renseigner vos informations personnelles : prénom, nom, téléphone, date de naissance, adresse, code postal et ville, puis accepter les Conditions Générales d'Utilisation Winelio.
        </p>

        <Link
          href="/profile"
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-semibold text-sm shadow-md hover:opacity-90 transition-opacity text-center"
        >
          Compléter mon profil →
        </Link>
      </div>
    </div>
  );
}
