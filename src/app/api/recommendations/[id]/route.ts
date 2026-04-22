import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;

  const { data: rec, error } = await supabaseAdmin
    .schema("winelio")
    .from("recommendations")
    .select(
      `id, status, amount, project_description, urgency_level, created_at, referrer_id, professional_id,
       contact:contacts(first_name, last_name, email, phone),
       professional:profiles!recommendations_professional_id_fkey(first_name, last_name, company:companies(name)),
       referrer:profiles!recommendations_referrer_id_fkey(first_name, last_name)`
    )
    .eq("id", id)
    .single();

  if (error || !rec) {
    return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });
  }

  // Access control: only referrer, professional, or super_admin can read
  const isParty = rec.referrer_id === user.id || rec.professional_id === user.id;
  const isAdmin = user.app_metadata?.role === "super_admin";
  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { data: recSteps } = await supabaseAdmin
    .schema("winelio")
    .from("recommendation_steps")
    .select(
      "id, step_id, completed_at, data, step:steps(name, description, completion_role, order_index)"
    )
    .eq("recommendation_id", id);

  return NextResponse.json({ recommendation: rec, steps: recSteps ?? [] });
}
