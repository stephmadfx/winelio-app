import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await assertNewsletterAdmin();
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .schema("winelio")
      .from("newsletter_templates")
      .select("id, name, subject, preheader, mjml_content, html_content, project_data, status, updated_at")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Template introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      name: data.name,
      subject: data.subject,
      preheader: data.preheader,
      mjmlContent: data.mjml_content,
      htmlContent: data.html_content,
      projectData: data.project_data,
      status: data.status,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
