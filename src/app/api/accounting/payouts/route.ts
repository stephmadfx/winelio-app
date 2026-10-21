import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const csvCell = (value: unknown) => `"${String(value ?? "").replace(/^[\s=+@-]/, "'$&").replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (user.app_metadata?.role !== "super_admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2026 || year > 9998) return NextResponse.json({ error: "Année invalide" }, { status: 400 });
  const rows = [["Attestation", "Émetteur", "SIRET émetteur", "Date versement", "Identifiant bénéficiaire", "Bénéficiaire", "Adresse", "Code postal", "Ville", "Retrait brut EUR", "Frais EUR", "Versé net EUR"]];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("accounting_documents")
      .select("number,issuer,recipient,owner_id,event_at,amounts")
      .eq("kind", "payout").eq("is_demo", false)
      .gte("event_at", `${year}-01-01T00:00:00+01:00`).lt("event_at", `${year + 1}-01-01T00:00:00+01:00`)
      .order("event_at").order("id").range(offset, offset + 499);
    if (error) return NextResponse.json({ error: "Export indisponible" }, { status: 503 });
    for (const d of data ?? []) rows.push([d.number ?? "Coordonnées à compléter",d.issuer.legal_name,d.issuer.siret,
      new Date(d.event_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }),d.owner_id,
      d.recipient.name,d.recipient.address,d.recipient.postal_code,d.recipient.city,
      Number(d.amounts.withdrawn).toFixed(2).replace(".", ","),Number(d.amounts.fees).toFixed(2).replace(".", ","),Number(d.amounts.paid).toFixed(2).replace(".", ",")]);
    if ((data?.length ?? 0) < 500) break;
  }
  return new Response("\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="versements-${year}.csv"`, "Cache-Control": "private, no-store" },
  });
}
