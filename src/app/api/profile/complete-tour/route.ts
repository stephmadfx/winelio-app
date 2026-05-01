import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/profile/complete-tour
// Marque la visite guidée du dashboard comme terminée pour le user courant.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { error } = await supabase
    .schema("winelio")
    .from("profiles")
    .update({ tour_completed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
