import { supabaseAdmin } from "../src/lib/supabase/admin";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

async function generateUniqueAlias(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join("");
    const alias = `#${suffix}`;

    const { data } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("alias", alias)
      .maybeSingle();

    if (!data) return alias;
  }
  throw new Error("Impossible de générer un alias unique après 10 tentatives");
}

async function main() {
  const { data: companies, error } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .is("alias", null);

  if (error) {
    console.error("Erreur fetch companies:", error.message);
    process.exit(1);
  }

  console.log(`${companies?.length ?? 0} entreprise(s) à migrer...`);

  for (const company of companies ?? []) {
    const alias = await generateUniqueAlias();
    const { error: updateError } = await supabaseAdmin
      .from("companies")
      .update({ alias })
      .eq("id", company.id);

    if (updateError) {
      console.error(`✗ ${company.name}: ${updateError.message}`);
    } else {
      console.log(`✓ ${company.name} → ${alias}`);
    }
  }

  console.log("Backfill terminé.");
}

main().catch(console.error);
