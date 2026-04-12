import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (!DEMO_MODE) {
    return NextResponse.json({ status: "unavailable" });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "unauthenticated" }, { status: 401 });

  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("demo_owner_id", user.id);

  return NextResponse.json({ status: (count ?? 0) > 0 ? "ready" : "none" });
}
