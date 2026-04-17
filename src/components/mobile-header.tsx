"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SignOutButton } from "./sign-out-button";
import { WinelioLogo } from "./winelio-logo";
import { BugReportButton } from "./bug-report";
import type { BugReport } from "./bug-report/types";

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

const ANIM_DURATION = 500;

export function MobileHeader({
  userEmail,
  firstName,
  isSuperAdmin,
  demoBanner = false,
  userId,
  allBugReports = [],
}: {
  userEmail: string;
  firstName?: string;
  isSuperAdmin?: boolean;
  demoBanner?: boolean;
  userId: string;
  allBugReports?: BugReport[];
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [visible, setVisible] = useState(false); // contrôle le rendu DOM

  const displayName = firstName ?? userEmail.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();

  const hour = new Date().getHours();
  const greeting = hour >= 19 || hour < 6 ? "Bonsoir," : "Bonjour,";

  const openMenu = () => {
    setVisible(true);
    // micro-délai pour que le navigateur applique le style initial avant la transition
    requestAnimationFrame(() => requestAnimationFrame(() => setIsOpen(true)));
  };

  const closeMenu = () => {
    setIsOpen(false);
    setTimeout(() => setVisible(false), ANIM_DURATION);
  };

  // Fermer sur changement de route
  useEffect(() => {
    closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Bloquer le scroll quand ouvert
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <>
      {/* ── Header bar ── */}
      <header
        className={`fixed left-0 right-0 z-50 bg-winelio-light/80 backdrop-blur-md border-b border-black/5 shadow-sm lg:hidden ${
          demoBanner ? "top-6" : "top-0"
        }`}
      >
        <div className="relative flex items-center justify-between px-4 h-16">
          {/* Gauche : logo */}
          <Link href="/dashboard" aria-label="Winelio — Accueil">
            <WinelioLogo variant="color" height={28} gradientId="wGrad-mheader" />
          </Link>

          {/* Centre : greeting */}
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center leading-none">
            <span className="text-[10px] uppercase tracking-widest text-winelio-gray font-bold">
              {greeting}
            </span>
            <span className="font-bold text-base text-winelio-orange tracking-tight">
              {displayName} 👋
            </span>
          </div>

          {/* Droite : bug + hamburger */}
          <div className="flex items-center gap-0.5">
            <BugReportButton userId={userId} allBugReports={allBugReports} variant="inline" />
            <button
              onClick={openMenu}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-winelio-gray active:bg-winelio-orange/10 active:text-winelio-orange transition-colors"
              aria-label="Ouvrir le menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Drawer ── */}
      {visible && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeMenu}
            style={{ transition: `opacity ${ANIM_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)` }}
            className={`fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm lg:hidden ${
              isOpen ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* Panneau — glisse depuis la droite */}
          <div
            style={{
              transform: isOpen ? "translateX(0)" : "translateX(100%)",
              transition: `transform ${ANIM_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
            }}
            className="fixed top-0 right-0 z-[70] h-full w-[85vw] max-w-sm bg-white shadow-2xl flex flex-col lg:hidden"
          >
            {/* En-tête du panneau */}
            <div className="px-6 pt-8 pb-5 border-b border-black/5">
              <div className="flex items-center justify-between mb-5">
                <WinelioLogo variant="color" height={28} gradientId="wGrad-drawer" />
                <button
                  onClick={closeMenu}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-winelio-gray hover:bg-gray-100 active:scale-95 transition-all"
                  aria-label="Fermer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-winelio-orange to-winelio-amber flex items-center justify-center shadow-sm shrink-0">
                  <span className="text-white font-bold">{initials}</span>
                </div>
                <div>
                  <p className="font-bold text-winelio-dark text-sm leading-tight">{displayName}</p>
                  <p className="text-xs text-winelio-gray truncate max-w-[180px]">{userEmail}</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white shadow-sm"
                        : "text-winelio-gray hover:bg-winelio-orange/5 hover:text-winelio-dark"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 shrink-0"
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

              {isSuperAdmin && (
                <>
                  <div className="pt-3 pb-1 mx-1 border-t border-black/5" />
                  <Link
                    href="/gestion-reseau"
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                      pathname.startsWith("/gestion-reseau")
                        ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white shadow-sm"
                        : "text-winelio-orange/80 hover:bg-winelio-orange/5"
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

            {/* Pied */}
            <div className="px-4 py-5 border-t border-black/5">
              <SignOutButton variant="light" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
