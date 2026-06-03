import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/profile/pro-prompt
// Masque definitivement la popup "Etes-vous professionnel ?" pour le user courant.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ pro_prompt_dismissed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
