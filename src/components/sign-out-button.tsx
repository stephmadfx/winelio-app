"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <button
      onClick={handleSignOut}
      className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-white/20 rounded-lg hover:border-white/40 transition-colors"
    >
      Déconnexion
    </button>
  );
}
