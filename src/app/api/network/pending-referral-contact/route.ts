import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PENDING_REFERRAL_STATUS } from "@/lib/pending-referral";

export const GET = async (request: Request) => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const referralId = new URL(request.url).searchParams.get("referralId");
  if (!referralId) return NextResponse.json({ error: "Filleul manquant." }, { status: 400 });

  const { data: referral, error } = await supabaseAdmin
    .from("profiles")
    .select("id, sponsor_id, first_name, last_name, email, phone, onboarding_status")
    .eq("id", referralId)
    .maybeSingle();

  if (error) {
    console.error("[pending-referral-contact]", error);
    return NextResponse.json({ error: "Coordonnées indisponibles." }, { status: 500 });
  }
  if (!referral || referral.sponsor_id !== user.id) {
    return NextResponse.json({ error: "Seul le parrain direct peut relancer ce filleul." }, { status: 403 });
  }
  if (referral.onboarding_status !== PENDING_REFERRAL_STATUS) {
    return NextResponse.json({ error: "Ce compte est déjà activé." }, { status: 409 });
  }

  return NextResponse.json({
    firstName: referral.first_name?.trim() ?? "",
    lastName: referral.last_name?.trim() ?? "",
    email: referral.email?.trim() ?? "",
    phone: referral.phone?.trim() ?? "",
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
};
