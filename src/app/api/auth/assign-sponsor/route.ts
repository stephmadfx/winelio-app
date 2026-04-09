import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assignSponsorIfNeeded } from "@/lib/assign-sponsor";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { sponsorCode } = body as { sponsorCode?: string | null };

  const assigned = await assignSponsorIfNeeded(user.id, sponsorCode);
  return NextResponse.json({ success: true, assigned });
}
