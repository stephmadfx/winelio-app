"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";

const navItems = [
  {
    label: "Dashboard",
    href: "/gestion-reseau",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  {
    label: "Recommandations",
    href: "/gestion-reseau/recommandations",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    label: "Réseau MLM",
    href: "/gestion-reseau/reseau",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  },
  {
    label: "Utilisateurs",
    href: "/gestion-reseau/utilisateurs",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  },
  {
    label: "Professionnels",
    href: "/gestion-reseau/professionnels",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  },
  {
    label: "Retraits",
    href: "/gestion-reseau/retraits",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export function AdminLayoutShell({
  children,
  userEmail,
}: {
  children: React.ReactNode;
  userEmail: string;
}) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin-sidebar-collapsed") === "true";
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (mobile = false) => (
    <div className="flex flex-col h-full">
      {/* Logo + toggle */}
      <div className={`flex items-center py-4 border-b border-border ${collapsed && !mobile ? "justify-center px-2" : "justify-between px-4"}`}>
        <Link href="/gestion-reseau" className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-extrabold tracking-tight text-winelio-orange shrink-0">BR</span>
          {(!collapsed || mobile) && (
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest truncate">
              Admin
            </span>
          )}
        </Link>
        {!mobile && (
          <button
            onClick={() => setCollapsed((p) => !p)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 flex flex-col gap-1 py-3 ${collapsed && !mobile ? "px-2" : "px-3"}`}>
        {navItems.map((item) => {
          const isActive =
            item.href === "/gestion-reseau"
              ? pathname === "/gestion-reseau"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed && !mobile ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                collapsed && !mobile ? "justify-center" : ""
              } ${
                isActive
                  ? "bg-gradient-to-r from-winelio-orange to-winelio-amber text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {(!collapsed || mobile) && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`mt-auto pb-4 flex flex-col gap-2 border-t border-border pt-3 ${collapsed && !mobile ? "px-2 items-center" : "px-4"}`}>
        {(!collapsed || mobile) && (
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        )}
        <SignOutButton iconOnly={collapsed && !mobile} />
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Sidebar desktop */}
      <aside
        className={`hidden md:flex fixed left-0 top-0 h-screen flex-col bg-card border-r border-border z-50 transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {sidebarContent(false)}
      </aside>

      {/* Drawer mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`md:hidden fixed left-0 top-0 h-screen w-72 bg-card border-r border-border z-50 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent(true)}
      </aside>

      {/* Contenu principal */}
      <div
        className={`flex flex-col min-h-dvh transition-all duration-300 ${
          collapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {/* Topbar */}
        <header className="h-12 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-30">
          <button
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={() => setMobileOpen((p) => !p)}
            aria-label="Ouvrir le menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-xs font-semibold uppercase tracking-widest text-winelio-orange">
            Super Admin
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-foreground">Winelio</span>
          <Link
            href="/dashboard"
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            App
          </Link>
          <span className="text-xs text-muted-foreground hidden sm:block">{userEmail}</span>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
