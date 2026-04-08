"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton({
  iconOnly = false,
  variant = "dark",
}: {
  iconOnly?: boolean;
  variant?: "dark" | "light";
}) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const styles =
    variant === "light"
      ? `${iconOnly ? "p-2" : "px-3 py-2"} text-sm text-winelio-gray hover:text-winelio-dark border border-black/10 rounded-xl hover:bg-black/5 transition-colors`
      : `${iconOnly ? "p-2" : "px-4 py-2"} text-sm text-gray-400 hover:text-white border border-white/20 rounded-lg hover:border-white/40 transition-colors`;

  return (
    <button
      onClick={handleSignOut}
      aria-label={iconOnly ? "Déconnexion" : undefined}
      className={styles}
    >
      {!iconOnly && <span>Déconnexion</span>}
      {iconOnly && (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      )}
    </button>
  );
}
