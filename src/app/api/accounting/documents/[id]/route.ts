import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accountingDocumentPdf } from "@/lib/accounting-documents";
import type { AccountingDocument } from "@/lib/accounting-document-template";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }
  // Client utilisateur : la RLS contrôle le propriétaire ou le rôle super_admin.
  const { data, error } = await supabase.from("accounting_documents").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Lecture du document impossible" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  if (!data.number || !data.issued_at) return NextResponse.json({ error: "Complétez vos coordonnées pour émettre ce document." }, { status: 409 });
  try {
    const pdf = await accountingDocumentPdf(data as AccountingDocument);
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "Le PDF est temporairement indisponible. Réessayez dans quelques instants." }, { status: 503 });
  }
}
