import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  // Invalide la session côté Supabase
  await supabase.auth.signOut();

  const response = NextResponse.json({ success: true });

  // Efface tous les cookies de session Supabase (httpOnly)
  const cookieNames = ["sb-access-token", "sb-refresh-token"];
  for (const name of cookieNames) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  // Efface aussi les cookies au format sb-<projectRef>-auth-token
  // en listant tous les cookies existants
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("auth")) {
      response.cookies.set(cookie.name, "", { maxAge: 0, path: "/" });
    }
  }

  return response;
}
