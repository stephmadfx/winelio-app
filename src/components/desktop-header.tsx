"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileAvatar } from "./profile-avatar";

export function DesktopHeader({
  userEmail,
  firstName,
  avatar,
}: {
  userEmail: string;
  firstName?: string;
  avatar?: string | null;
}) {
  const displayName = firstName?.trim() || "Mon profil";

  // Salutation calculée côté client uniquement pour éviter une mismatch hydration
  const [greeting, setGreeting] = useState("Bonjour,");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h >= 19 || h < 6 ? "Bonsoir," : "Bonjour,");
  }, []);

  return (
    <header
      className="hidden lg:flex fixed left-64 right-0 top-0 z-30 items-center justify-end gap-4 px-8 h-16 bg-winelio-light/80 backdrop-blur-md border-b border-black/5"
    >
      <Link
        href="/profile"
        className="flex items-center gap-3 rounded-2xl px-2 py-1 transition-colors hover:bg-winelio-orange/5"
        aria-label="Aller à mon profil"
      >
        <div className="flex flex-col items-end leading-none">
          <span className="text-[10px] uppercase tracking-widest text-winelio-gray font-bold">
            {greeting}
          </span>
          <span className="font-bold text-sm text-winelio-orange tracking-tight">
            {displayName} 👋
          </span>
        </div>
        <ProfileAvatar
          name={displayName}
          avatar={avatar}
          className="h-10 w-10 ring-2 ring-winelio-orange/20 shadow-sm"
          initialsClassName="text-xs font-bold"
        />
      </Link>
    </header>
  );
}
