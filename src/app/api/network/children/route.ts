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

  const { data: children } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
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
