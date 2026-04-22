import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rid = searchParams.get("rid");

  if (!rid) return NextResponse.redirect(SITE_URL);

  // On doit décider de la destination selon le source de la company liée au pro
  let destination = `${SITE_URL}/recommendations/${rid}`;

  try {
    const { data: rec } = await supabaseAdmin
      .schema("winelio")
      .from("recommendations")
      .select("id, professional_id, email_clicked_at, companies:profiles!recommendations_professional_id_fkey(companies(source))")
      .eq("id", rid)
      .single();

    // Premier clic uniquement
    if (rec && !rec.email_clicked_at) {
      await supabaseAdmin
        .schema("winelio")
        .from("recommendations")
        .update({ email_clicked_at: new Date().toISOString() })
        .eq("id", rid)
        .is("email_clicked_at", null);
    }

    // Lire la source de la company pour router vers /claim si scrapée
    const { data: proCompany } = await supabaseAdmin
      .schema("winelio")
      .from("companies")
      .select("source")
      .eq("owner_id", rec?.professional_id ?? "")
      .maybeSingle();

    if (proCompany?.source === "scraped") {
      destination = `${SITE_URL}/claim/${rid}`;
    }
  } catch (e) {
    console.error("[email-track/click] update error:", e);
  }

  return NextResponse.redirect(destination, { status: 302 });
}
