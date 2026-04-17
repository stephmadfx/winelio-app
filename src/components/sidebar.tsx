"use client";

import Link from "next/link";
import { WinelioLogo } from "./winelio-logo";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./sign-out-button";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    label: "Recommandations",
    href: "/recommendations",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    label: "Réseau",
    href: "/network",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    label: "Gains",
    href: "/wallet",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    label: "Ma fiche pro",
    href: "/companies",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  },
  {
    label: "Profil",
    href: "/profile",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
  {
    label: "Paramètres",
    href: "/settings",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
];

export function Sidebar({ userEmail, isSuperAdmin, demoBanner = false }: { userEmail: string; isSuperAdmin?: boolean; demoBanner?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className={`fixed left-0 w-64 bg-[#eff1f2] border-r border-black/5 flex flex-col ${demoBanner ? "top-6 h-[calc(100vh-1.5rem)]" : "top-0 h-screen"}`}>

      {/* Logo */}
      <div className="px-5 py-6 border-b border-black/5">
        <Link href="/dashboard" aria-label="Winelio — Accueil">
          <WinelioLogo variant="color" height={36} gradientId="wGrad-sidebar" />
        </Link>
        <p className="text-winelio-orange text-xs font-semibold mt-1 pl-0.5">Espace Membre</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-winelio-orange shadow-sm shadow-black/5"
                  : "text-winelio-gray hover:bg-white/60 hover:text-winelio-dark"
              }`}
            >
              <svg
                className={`w-5 h-5 shrink-0 ${isActive ? "text-winelio-orange" : "text-winelio-gray"}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={isActive ? 2 : 1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}

        {/* Super Admin */}
        {isSuperAdmin && (
          <>
            <div className="pt-3 pb-1 px-2">
              <div className="border-t border-black/8" />
            </div>
            <Link
              href="/gestion-reseau"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname.startsWith("/gestion-reseau")
                  ? "bg-white text-winelio-orange shadow-sm shadow-black/5"
                  : "text-winelio-orange/70 hover:bg-white/60 hover:text-winelio-orange"
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Super Admin
            </Link>
          </>
        )}
      </nav>

      {/* Bas : email + déconnexion */}
      <div className="px-3 py-4 border-t border-black/5 space-y-2">
        <p className="text-xs text-winelio-gray/60 truncate px-3">{userEmail}</p>
        <SignOutButton variant="light" />
      </div>
    </aside>
  );
}
