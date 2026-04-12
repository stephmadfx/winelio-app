import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");

  if (!parentId) {
    return NextResponse.json({ error: "parentId requis" }, { status: 400 });
  }

  // Vérifie que parentId appartient bien au réseau de l'utilisateur connecté (anti-IDOR)
  if (parentId !== user.id) {
    const { data: networkIds } = await supabaseAdmin.rpc("get_network_ids", {
      p_user_id: user.id,
      p_max_depth: 5,
    });
    const validIds = new Set((networkIds ?? []).map((r: { member_id: string }) => r.member_id));
    if (!validIds.has(parentId)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  const { data: children } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, city, is_professional, is_demo, companies!owner_id(alias, category:categories(name))")
    .eq("sponsor_id", parentId);

  if (!children) {
    return NextResponse.json({ children: [] });
  }

  const ACTIVE_STATUSES = [
    "PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED",
    "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED",
  ];

  const results = await Promise.all(
    children.map(async (child) => {
      const [
        { count: childCount },
        { count: activeRecos },
        { count: completedRecos },
      ] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("sponsor_id", child.id),
        supabaseAdmin
          .from("recommendations")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", child.id)
          .in("status", ACTIVE_STATUSES),
        supabaseAdmin
          .from("recommendations")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", child.id)
          .eq("status", "COMPLETED"),
      ]);

      const rawCompany = Array.isArray(child.companies) ? child.companies[0] ?? null : (child.companies ?? null);
      const rawCat = rawCompany ? (rawCompany as Record<string, unknown>).category : null;
      const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;

      return {
        id: child.id,
        first_name: child.first_name,
        last_name: child.last_name,
        city: child.city,
        is_professional: (child as { is_professional?: boolean }).is_professional ?? false,
        is_demo: (child as { is_demo?: boolean }).is_demo ?? false,
        company_alias: rawCompany ? (rawCompany as { alias?: string | null }).alias ?? null : null,
        company_category: catName,
        childCount: childCount ?? 0,
        activeRecos: activeRecos ?? 0,
        completedRecos: completedRecos ?? 0,
      };
    })
  );

  return NextResponse.json({ children: results });
}
