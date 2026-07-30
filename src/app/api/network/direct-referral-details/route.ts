import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const referralId = new URL(request.url).searchParams.get("referralId");
  if (!referralId) return NextResponse.json({ error: "Filleul manquant." }, { status: 400 });

  const { data: referral, error } = await supabaseAdmin.from("profiles")
    .select("id, sponsor_id, first_name, last_name, email, phone, avatar, address, city, postal_code, created_at, is_professional, is_demo, onboarding_status, companies!owner_id(name, city, category:categories(name))")
    .eq("id", referralId)
    .maybeSingle();

  if (error) {
    console.error("[direct-referral-details]", error);
    return NextResponse.json({ error: "Fiche indisponible." }, { status: 500 });
  }
  if (!referral || referral.sponsor_id !== user.id) {
    return NextResponse.json({ error: "Cette fiche est réservée au parrain direct." }, { status: 403 });
  }

  const [{ count: referralCount }, { data: commissions }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("sponsor_id", referral.id),
    supabaseAdmin.from("commission_transactions").select("amount").eq("source_user_id", referral.id),
  ]);

  const rawCompany = Array.isArray(referral.companies) ? referral.companies[0] ?? null : referral.companies ?? null;
  const rawCategory = rawCompany ? (rawCompany as Record<string, unknown>).category : null;
  const categoryName = Array.isArray(rawCategory)
    ? (rawCategory[0] as { name?: string } | undefined)?.name ?? null
    : (rawCategory as { name?: string } | null)?.name ?? null;

  return NextResponse.json({
    id: referral.id,
    firstName: referral.first_name,
    lastName: referral.last_name,
    email: referral.email,
    phone: referral.phone,
    avatar: referral.avatar,
    address: referral.address,
    city: referral.city,
    postalCode: referral.postal_code,
    createdAt: referral.created_at,
    isProfessional: referral.is_professional,
    isDemo: referral.is_demo,
    onboardingStatus: referral.onboarding_status,
    companyName: rawCompany ? (rawCompany as { name?: string | null }).name ?? null : null,
    companyCity: rawCompany ? (rawCompany as { city?: string | null }).city ?? null : null,
    companyCategory: categoryName,
    referralCount: referralCount ?? 0,
    totalCommissions: (commissions ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
