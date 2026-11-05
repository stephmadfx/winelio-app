// Actions des liens du mail "reco sans mouvement". POST uniquement (jamais de mutation sur GET :
// les scanners de liens des messageries ouvrent les URL).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyReminderToken } from "@/lib/pending-reminder";
import { notifyRecoRefused } from "@/lib/notify-reco-refused";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const verified = verifyReminderToken(String(body.token ?? ""));
  if (!verified.ok) {
    return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "cancel" && action !== "unsubscribe") {
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  const db = supabaseAdmin.schema("winelio");
  const { data: rec } = await db.from("recommendations").select("id, status, professional_id").eq("id", verified.rid).single();
  if (!rec) return NextResponse.json({ error: "Recommandation introuvable" }, { status: 404 });

  if (action === "unsubscribe") {
    const { error } = await db.from("profiles")
      .update({ reco_reminders_opt_out_at: new Date().toISOString() }).eq("id", rec.professional_id);
    if (error) return NextResponse.json({ error: "Impossible d'enregistrer votre choix" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // cancel : même effet que POST /api/recommendations/[id]/refuse, sans session.
  if (rec.status === "CANCELLED") return NextResponse.json({ ok: true, already: true });
  if (rec.status !== "PENDING") {
    return NextResponse.json({ error: "Cette recommandation ne peut plus être annulée." }, { status: 409 });
  }
  const { data: updated, error } = await db.from("recommendations")
    .update({ status: "CANCELLED" }).eq("id", rec.id).eq("status", "PENDING").select("id");
  if (error) return NextResponse.json({ error: "Impossible d'annuler cette recommandation" }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json({ error: "Cette recommandation ne peut plus être annulée." }, { status: 409 });
  }

  await db.from("recommendation_followups")
    .update({ status: "cancelled", cancel_reason: "reco_refused" })
    .eq("recommendation_id", rec.id).eq("status", "pending");
  notifyRecoRefused(rec.id).catch((e) => console.error("[reminder-action] notify-reco-refused:", e));

  return NextResponse.json({ ok: true });
}
