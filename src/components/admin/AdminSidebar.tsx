"use client";

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
    label: "Bugs & idées",
    href: "/gestion-reseau/bugs",
    icon: "M4 6h6v6H4zM14 6h6v12h-6zM4 14h6v4H4z",
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
    label: "Retraits",
    href: "/gestion-reseau/retraits",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export function AdminSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-winelio-dark text-white flex flex-col items-center py-4 z-50">
      {/* Logo compact */}
      <Link href="/gestion-reseau" className="mb-6">
        <span className="text-xs font-extrabold tracking-tight text-winelio-orange">KP</span>
      </Link>

      {/* Navigation icônes */}
      <nav className="flex-1 flex flex-col gap-1 w-full px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/gestion-reseau"
              ? pathname === "/gestion-reseau"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`flex items-center justify-center w-full aspect-square rounded-xl transition-colors ${
                isActive
                  ? "bg-gradient-to-br from-winelio-orange to-winelio-amber text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="mt-auto px-2 w-full flex flex-col items-center gap-2">
        <p className="text-xs text-gray-500 text-center break-all leading-tight">
          {userEmail.split("@")[0]}
        </p>
        <SignOutButton iconOnly />
      </div>
    </aside>
  );
}
