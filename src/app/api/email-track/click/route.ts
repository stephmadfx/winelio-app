import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/get-user";

const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://winelio.app").replace(/\/$/, "");

const isPlaceholderEmail = (e: string | null | undefined) =>
  !!e && /@(kiparlo-pro\.fr|winelio-scraped\.local|winko)/i.test(e);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rid = searchParams.get("rid");

  if (!rid) return NextResponse.redirect(SITE_URL);

  let destination = `${SITE_URL}/recommendations/${rid}`;

  try {
    // Update du timestamp de premier clic (best effort)
    const { data: rec } = await supabaseAdmin
      .schema("winelio")
      .from("recommendations")
      .select("id, professional_id, email_clicked_at")
      .eq("id", rid)
      .single();

    if (rec && !rec.email_clicked_at) {
      await supabaseAdmin
        .schema("winelio")
        .from("recommendations")
        .update({ email_clicked_at: new Date().toISOString() })
        .eq("id", rid)
        .is("email_clicked_at", null);
    }

    // Récupérer le profil du pro + sa company pour décider de la destination
    const { data: proProfile } = await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .select("id, email, companies!owner_id(source, email)")
      .eq("id", rec?.professional_id ?? "")
      .maybeSingle();

    const company = Array.isArray(proProfile?.companies)
      ? proProfile?.companies[0]
      : proProfile?.companies;
    const isScraped = company?.source === "scraped";

    if (isScraped) {
      // Pro pas encore inscrit sur Winelio → onboarding via /claim
      destination = `${SITE_URL}/claim/${rid}`;
    } else {
      // Pro déjà inscrit (owner) → direction la page reco.
      // Si l'utilisateur n'est pas déjà connecté comme ce pro, rediriger via login
      // avec l'email pré-rempli et un returnTo vers la reco.
      const currentUser = await getUser();
      const loggedAsThisPro = currentUser?.id === rec?.professional_id;

      if (!loggedAsThisPro) {
        const loginUrl = new URL(`${SITE_URL}/auth/login`);
        loginUrl.searchParams.set("returnTo", `/recommendations/${rid}`);

        // Email de connexion : priorité à l'email du profile (le vrai email
        // du pro), fallback sur celui de la company. Ne pas exposer les
        // placeholders de seeding.
        const candidateEmail = !isPlaceholderEmail(proProfile?.email)
          ? proProfile?.email
          : !isPlaceholderEmail(company?.email)
          ? company?.email
          : null;
        if (candidateEmail) {
          loginUrl.searchParams.set("email", candidateEmail);
        }
        destination = loginUrl.toString();
      }
    }
  } catch (e) {
    console.error("[email-track/click] error:", e);
  }

  return NextResponse.redirect(destination, { status: 302 });
}
