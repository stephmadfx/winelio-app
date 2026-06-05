import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProfessionalLeadAccessBlock } from "@/lib/professional-lead-access";

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
  const countOnly = searchParams.get("countOnly") === "true";
  const leadAccessBlock =
    tab === "received" ? await getProfessionalLeadAccessBlock(user.id) : null;

  if (countOnly) {
    const { count, error } = await supabaseAdmin
      .schema("winelio")
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq(column, user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ count: count ?? 0, leadAccessBlock });
  }

  let query = supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, status, amount, created_at, email_opened_at, email_clicked_at, abandoned_by_pro_at,
       contact:contacts(first_name, last_name),
       professional:profiles!recommendations_professional_id_fkey(
         first_name, last_name,
         companies!owner_id(alias, city, category:categories(name))
       )`
    )
    .eq(column, user.id);

  if (leadAccessBlock) {
    query = query.lte("created_at", leadAccessBlock.blockedSince);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recommendations: data ?? [], leadAccessBlock });
}
