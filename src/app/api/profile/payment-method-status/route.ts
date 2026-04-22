import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .schema("winelio")
    .from("profiles")
    .select("stripe_payment_method_id")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ hasPaymentMethod: !!profile?.stripe_payment_method_id });
}
