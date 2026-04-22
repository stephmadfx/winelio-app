import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Liste les recommandations du user connecté, filtrées par rôle.
 * ?tab=sent     → recommandations envoyées (referrer_id = user.id)
 * ?tab=received → recommandations reçues   (professional_id = user.id)
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") === "received" ? "received" : "sent";
  const column = tab === "sent" ? "referrer_id" : "professional_id";

  const { data, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, status, amount, created_at, email_opened_at, email_clicked_at,
       contact:contacts(first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(
         first_name, last_name,
         companies!owner_id(alias, city, category:categories(name))
       )`
    )
    .eq(column, user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recommendations: data ?? [] });
}
