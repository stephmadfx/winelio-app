import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewReferral } from "@/lib/notify-new-referral";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Consomme le body pour ne pas bloquer le stream
    await req.json().catch(() => {});

    const notified = await notifyNewReferral(user.id);
    return NextResponse.json({ success: true, notified });
  } catch (err) {
    console.error("new-referral error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
