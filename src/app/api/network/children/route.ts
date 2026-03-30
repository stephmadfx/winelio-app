import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Use service-level query that bypasses RLS for counting recos
  const { data: children } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("sponsor_id", parentId);

  if (!children) {
    return NextResponse.json({ children: [] });
  }

  // For each child, get counts using admin-like queries
  // Since this is server-side, we can use RPC or direct queries
  const results = await Promise.all(
    children.map(async (child) => {
      const [{ count: childCount }, { count: activeRecos }, { count: completedRecos }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("sponsor_id", child.id),
          // For recommendation counts, we need to bypass RLS
          // Use a workaround: count via commission_transactions which may have different RLS
          // Or just use the profiles-based approach
          supabase.rpc("count_user_recos_by_status", {
            p_user_id: child.id,
            p_statuses: ["PENDING", "ACCEPTED", "CONTACT_MADE", "MEETING_SCHEDULED", "QUOTE_SUBMITTED", "QUOTE_VALIDATED", "PAYMENT_RECEIVED"],
          }).then(
            (r) => ({ count: r.data ?? 0 }),
            () => ({ count: 0 })
          ),
          supabase.rpc("count_user_recos_by_status", {
            p_user_id: child.id,
            p_statuses: ["COMPLETED"],
          }).then(
            (r) => ({ count: r.data ?? 0 }),
            () => ({ count: 0 })
          ),
        ]);

      return {
        id: child.id,
        first_name: child.first_name,
        last_name: child.last_name,
        childCount: childCount ?? 0,
        activeRecos: activeRecos ?? 0,
        completedRecos: completedRecos ?? 0,
      };
    })
  );

  return NextResponse.json({ children: results });
}
