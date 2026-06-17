import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/get-user";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ALIAS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
async function generateAlias(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const suffix = Array.from({ length: 6 }, () =>
      ALIAS_CHARS[Math.floor(Math.random() * ALIAS_CHARS.length)]
    ).join("");
    const alias = `#${suffix}`;
    const { data } = await supabaseAdmin
      .schema("winelio")
      .from("companies")
      .select("id")
      .eq("alias", alias)
      .maybeSingle();
    if (!data) return alias;
  }
  throw new Error("Impossible de générer un alias unique");
}

/**
 * Import batch de companies scrapées.
 * Body: { rows: Array<{ name, email?, phone?, city?, postal_code?, address?, category_name? }> }
 * Crée un profile factice + une company pour chaque ligne avec source='scraped'.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || user.app_metadata?.role !== "super_admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  type Row = {
    name: string;
    email?: string;
    phone?: string;
    city?: string;
    postal_code?: string;
    address?: string;
    category_name?: string;
  };

  const { rows } = (await req.json()) as { rows: Row[] };
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Aucune ligne à importer" }, { status: 400 });
  }

  // Charger les catégories pour résoudre category_name → category_id
  const { data: cats } = await supabaseAdmin
    .schema("winelio")
    .from("categories")
    .select("id, name");
  const catMap = new Map<string, string>();
  (cats ?? []).forEach((c) => catMap.set(c.name.toLowerCase().trim(), c.id));

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.name || !row.name.trim()) {
      skipped++;
      continue;
    }

    // Dédoublonnage par email de company si fourni
    if (row.email) {
      const { data: existing } = await supabaseAdmin
        .schema("winelio")
        .from("companies")
        .select("id")
        .eq("email", row.email.toLowerCase().trim())
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
    }

    // Créer un profile factice (owner_id) pour la company scrapée.
    // Email placeholder pour qu'on puisse distinguer les pros scrapés non revendiqués.
    const placeholderEmail = `pro.${crypto.randomUUID().split("-")[0]}@winelio-scraped.local`;

    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: placeholderEmail,
      email_confirm: true,
      user_metadata: { scraped: true, app: "winelio" },
    });
    if (authErr || !authUser.user) {
      errors.push(`auth ${row.name}: ${authErr?.message || "unknown"}`);
      continue;
    }

    const userId = authUser.user.id;

    // Le trigger on_auth_user_created crée normalement le profile.
    // On update le profile après pour mettre is_professional et les infos.
    await supabaseAdmin
      .schema("winelio")
      .from("profiles")
      .upsert({
        id: userId,
        email: placeholderEmail,
        is_professional: true,
        city: row.city ?? null,
        postal_code: row.postal_code ?? null,
        address: row.address ?? null,
      });

    const categoryId = row.category_name
      ? catMap.get(row.category_name.toLowerCase().trim()) ?? null
      : null;

    const alias = await generateAlias();
    const { error: companyErr } = await supabaseAdmin
      .schema("winelio")
      .from("companies")
      .insert({
        owner_id: userId,
        name: row.name.trim(),
        alias,
        email: row.email?.toLowerCase().trim() || null,
        phone: row.phone?.trim() || null,
        city: row.city ?? null,
        postal_code: row.postal_code ?? null,
        address: row.address ?? null,
        category_id: categoryId,
        source: "scraped",
        is_verified: false,
        country: "FR",
      });

    if (companyErr) {
      errors.push(`company ${row.name}: ${companyErr.message}`);
      // Cleanup du user si la company a échoué
      await supabaseAdmin.auth.admin.deleteUser(userId);
      continue;
    }

    created++;
  }

  return NextResponse.json({ created, skipped, errors });
}
