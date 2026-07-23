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
  const leadAccessBlock =
    tab === "received" ? await getProfessionalLeadAccessBlock(user.id) : null;

  const countOnly = searchParams.get("countOnly") === "true";
  if (countOnly) {
    const { count, error } = await supabaseAdmin
      .schema("winelio")
      .from("recommendations")
      .select("*", { count: "exact", head: true })
      .eq(column, user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0 });
  }

  let query = supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, status, amount, created_at, email_opened_at, email_clicked_at, abandoned_by_pro_at,
       contact:contacts(first_name, last_name, city),
       professional:profiles!recommendations_professional_id_fkey(
         first_name, last_name,
         companies!owner_id(name, city, category:categories(name))
       )`
    )
    .eq(column, user.id);

  if (leadAccessBlock) {
    // Bloque uniquement les recos à l'étape 6+ (devis validé → facturation Stripe pro)
    // créées APRÈS le blocage. Les recos plus jeunes restent visibles : elles n'ont
    // pas pu déclencher de commission Stripe.
    query = query.or(
      `created_at.lte.${leadAccessBlock.blockedSince},status.in.(PENDING,ACCEPTED,CONTACT_MADE,MEETING_SCHEDULED,QUOTE_SUBMITTED)`
    );
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const mappedData = (data ?? []).map((rec: any) => {
    if (tab === "received" && rec.status === "PENDING" && rec.contact) {
      const contact = Array.isArray(rec.contact) ? rec.contact[0] : rec.contact;
      const f = contact?.first_name?.trim() || "";
      const l = contact?.last_name?.trim() || "";
      const c = contact?.city?.trim() || "";
      const fDisplay = f.length > 10 ? f.slice(0, 10) + "..." : f;
      let maskedName = fDisplay;
      if (fDisplay && l) {
        maskedName += ` ${l.charAt(0).toUpperCase()}.`;
      } else if (l) {
        maskedName = `${l.charAt(0).toUpperCase()}.`;
      }
      if (!maskedName) maskedName = "Contact";
      if (c) maskedName += ` (${c})`;

      return {
        ...rec,
        contact: {
          first_name: maskedName,
          last_name: null,
          city: contact?.city ?? null,
        },
      };
    }
    return rec;
  });

  return NextResponse.json({ recommendations: mappedData, leadAccessBlock });
}
