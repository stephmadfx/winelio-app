import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertNewsletterAdmin } from "@/lib/newsletter-auth";
import { DEFAULT_NEWSLETTER_MJML } from "@/lib/newsletter-defaults";
import { compileNewsletterMjml } from "@/lib/newsletter-mjml";

type SaveNewsletterBody = {
  id?: string | null;
  name?: string;
  subject?: string;
  preheader?: string;
  mjmlContent?: string;
  projectData?: unknown;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const normalizeText = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

export async function POST(req: Request) {
  try {
    const user = await assertNewsletterAdmin();
    const body = (await req.json()) as SaveNewsletterBody;

    const name = normalizeText(body.name, "Newsletter sans titre");
    const subject = normalizeText(body.subject);
    const preheader = normalizeText(body.preheader);
    const mjmlInput = normalizeText(body.mjmlContent, DEFAULT_NEWSLETTER_MJML);

    if (!name) {
      return NextResponse.json({ error: "Nom du template requis" }, { status: 400 });
    }

    const compiled = await compileNewsletterMjml(mjmlInput);
    const projectData = body.projectData && typeof body.projectData === "object"
      ? body.projectData
      : {};

    const payload = {
      user_id: user.id,
      name,
      subject,
      preheader,
      mjml_content: compiled.mjml,
      html_content: compiled.html,
      project_data: projectData,
      status: subject ? "ready" : "draft",
    };

    const query = supabaseAdmin
      .schema("winelio")
      .from("newsletter_templates");

    const existingId = body.id && isUuid(body.id) ? body.id : null;
    const { data, error } = existingId
      ? await query
          .update(payload)
          .eq("id", existingId)
          .eq("user_id", user.id)
          .select("id, updated_at")
          .single()
      : await query
          .insert(payload)
          .select("id, updated_at")
          .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Sauvegarde impossible" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: data.id,
      updatedAt: data.updated_at,
      html: compiled.html,
      mjml: compiled.mjml,
      warnings: compiled.errors.map((err) => err.formattedMessage || err.message),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur serveur";
    const status = message === "Accès refusé" ? 403 : message === "Non authentifié" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
