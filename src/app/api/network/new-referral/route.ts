import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewReferral } from "@/lib/notify-new-referral";
import { notifyAdminNewSignup } from "@/lib/notify-admin-new-signup";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    // Consomme le body pour ne pas bloquer le stream
    await req.json().catch(() => {});

    // Notification du parrain
    const notified = await notifyNewReferral(user.id);
    
    // Notification de l'admin
    await notifyAdminNewSignup(user.id).catch((err) => {
      console.error("notify-admin-new-signup error:", err);
    });

    return NextResponse.json({ success: true, notified });
  } catch (err) {
    console.error("new-referral error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
