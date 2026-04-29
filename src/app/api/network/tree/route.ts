import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? user.id;
  const maxLevel = parseInt(searchParams.get("maxLevel") ?? "5", 10);

  // Anti-IDOR check
  if (userId !== user.id && user.app_metadata?.role !== "super_admin") {
    const { data: networkIds } = await supabaseAdmin.rpc("get_network_ids", {
      p_user_id: user.id, p_max_depth: 5,
    });
    const validIds = new Set((networkIds ?? []).map((r: { member_id: string }) => r.member_id));
    if (!validIds.has(userId)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // ── Fetch all levels sequentially on the server ────
  const allRows: any[] = [];
  let currentParentIds = [userId];
  const visited = new Set<string>();
  visited.add(userId);

  for (let level = 1; level <= maxLevel; level++) {
    if (currentParentIds.length === 0) break;

    const { data: kids } = await supabaseAdmin
      .from("profiles")
      .select("id, sponsor_id, first_name, last_name, avatar, city, is_professional, is_demo, companies!owner_id(alias, category:categories(name))")
      .in("sponsor_id", currentParentIds);

    if (!kids || kids.length === 0) break;

    for (const child of kids) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);

      const rawCompany = Array.isArray(child.companies) ? child.companies[0] ?? null : (child.companies ?? null);
      const rawCat = rawCompany ? (rawCompany as Record<string, unknown>).category : null;
      const catName = Array.isArray(rawCat) ? (rawCat[0] as { name: string } | undefined)?.name ?? null : (rawCat as { name: string } | null)?.name ?? null;

      allRows.push({
        id: child.id,
        parentId: (child as any).sponsor_id,
        first_name: child.first_name,
        last_name: child.last_name,
        avatar: (child as any).avatar ?? null,
        city: child.city,
        is_professional: (child as any).is_professional ?? false,
        is_demo: (child as any).is_demo ?? false,
        company_alias: rawCompany ? (rawCompany as { alias?: string | null }).alias ?? null : null,
        company_category: catName,
        level,
      });
    }

    currentParentIds = kids.map((k) => k.id);
  }

  // ── Build tree from flat list ─────────────────────
  const childrenByParent: Record<string, typeof allRows> = {};
  const childCount: Record<string, number> = {};

  for (const row of allRows) {
    const pid = (row.parentId ?? userId) as string;
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(row);
    childCount[pid] = (childCount[pid] ?? 0) + 1;
  }

  function buildChildren(parentId: string): any[] {
    return (childrenByParent[parentId] ?? []).map((r) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      avatar: r.avatar,
      city: r.city,
      is_professional: r.is_professional,
      is_demo: r.is_demo,
      company_alias: r.company_alias,
      company_category: r.company_category,
      level: r.level,
      childCount: childCount[r.id] ?? 0,
      children: buildChildren(r.id),
    }));
  }

  return NextResponse.json({ children: buildChildren(userId) });
}
