import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ─── Configuration Supabase ──────────────────────────────────────────────────
const SUPABASE_URL = "https://supabase.aide-multimedia.fr";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.YJaG6JP4aadbwKUpNhLpx6j_F5F_oCvW5rCVn_FZn-o";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Filters ──────────────────────────────────────────────────────────────────
const COACH_KEYWORDS = [
  'sportif', 'sports', 'fitness', 'diétét', 'yoga', 'sophro', 'hypno', 'thérap', 'psych', 'ostéo', 
  'scol', 'parent', 'mental', 'vie', 'dirig', 'affaires', 'carrière', 'leadership', 'manager', 
  'compétence', 'orientation', 'perso', 'évol', 'transition', 'adolescent', 'couple', 'fertilité', 
  'nutrition', 'éveil', 'émotion', 'professionnel', 'EMS', 'coach', 'coaching'
];

const REAL_ESTATE_EXCLUSIONS = [
  'immo', 'maison', 'finance', 'invest', 'habitat', 'prêt', 'crédit', 'propriété', 'proprietes', 
  'patrimoine', 'bâtiment', 'construction'
];

function isCoach(name) {
  const clean = name.toLowerCase();
  const matchesKeyword = COACH_KEYWORDS.some(k => clean.includes(k));
  if (!matchesKeyword) return false;
  const matchesExclusion = REAL_ESTATE_EXCLUSIONS.some(e => clean.includes(e));
  if (matchesExclusion) return false;
  return true;
}

function isValidEmail(email) {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return clean.includes("@") && !clean.includes("introuvable") && !clean.includes("placeholder");
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== "\\") {
      inQuotes = !inQuotes;
    } else if (c === ";" && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const cleanContent = content.startsWith("\ufeff") ? content.slice(1) : content;
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  
  const header = lines[0].split(";").map((h) => h.trim().replace(/^"/, "").replace(/"$/, ""));
  const idx = {
    name: header.indexOf("Nom"),
    city: header.indexOf("Ville"),
    phone: header.indexOf("Téléphone"),
    email: header.indexOf("Email"),
    website: header.indexOf("Site Web"),
    address: header.indexOf("Adresse"),
    postalCode: header.indexOf("Code Postal"),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]).map(c => c.trim().replace(/^"/, "").replace(/"$/, ""));
    const row = {
      name: cols[idx.name] || "",
      city: idx.city !== -1 ? cols[idx.city] : "",
      phone: idx.phone !== -1 ? cols[idx.phone] : "",
      email: idx.email !== -1 ? cols[idx.email] : "",
      website: idx.website !== -1 ? cols[idx.website] : "",
      address: idx.address !== -1 ? cols[idx.address] : "",
      postalCode: idx.postalCode !== -1 ? cols[idx.postalCode] : "",
    };
    if (row.name) {
      rows.push(row);
    }
  }
  return rows;
}

const ALIAS_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function makeRandomAlias() {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += ALIAS_CHARS[Math.floor(Math.random() * ALIAS_CHARS.length)];
  }
  return `#${suffix}`;
}

async function main() {
  const filePath = "outputs/agents_independants_france.csv";
  console.log(`🚀 Starting import of coaches into Coach Développement personnel category`);
  
  // 1. Get Category ID
  const { data: catData, error: catErr } = await supabase
    .schema("winelio")
    .from("categories")
    .select("id")
    .eq("slug", "coach-developpement-personnel")
    .single();

  if (catErr || !catData) {
    console.error("❌ Category 'coach-developpement-personnel' not found in database.");
    process.exit(1);
  }
  const categoryId = catData.id;

  // 2. Parse CSV
  const allRows = parseCSV(filePath);
  console.log(`📄 Loaded ${allRows.length} total rows from CSV.`);

  // Filter for valid email + matches coach criteria
  const coachRows = allRows.filter(r => isCoach(r.name) && isValidEmail(r.email));
  console.log(`🎯 Found ${coachRows.length} coaches with valid emails to import.`);

  if (coachRows.length === 0) {
    console.log("✅ No coaches to import.");
    return;
  }

  // 3. Load DB cache for deduping
  const { data: existingProfiles } = await supabase.schema("winelio").from("profiles").select("email");
  const dbEmails = new Set((existingProfiles || []).map(p => p.email.toLowerCase().trim()));

  const { data: existingCompanies } = await supabase.schema("winelio").from("companies").select("email, phone");
  const companyEmails = new Set();
  const companyPhones = new Set();
  (existingCompanies || []).forEach(c => {
    if (c.email) companyEmails.add(c.email.toLowerCase().trim());
    if (c.phone) {
      const cleanPhone = c.phone.replace(/\s+/g, "").trim();
      if (cleanPhone) companyPhones.add(cleanPhone);
    }
  });

  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  async function processRow(row, index) {
    const rowNum = index + 1;
    const name = row.name;
    const email = row.email.toLowerCase().trim();
    const phone = row.phone?.replace(/\s+/g, "").trim();

    if (dbEmails.has(email) || companyEmails.has(email)) {
      skippedCount++;
      return;
    }
    if (phone && companyPhones.has(phone)) {
      skippedCount++;
      return;
    }

    try {
      // Create shadow user
      const placeholderEmail = `pro.${crypto.randomUUID().split("-")[0]}@winelio-scraped.local`;
      const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: true,
        user_metadata: { scraped: true, app: "winelio" },
      });

      if (authErr || !authUser?.user) {
        console.error(`❌ [Row ${rowNum}] Auth error for ${name}:`, authErr?.message);
        errorCount++;
        return;
      }
      const userId = authUser.user.id;

      // Update profile
      const { error: profileErr } = await supabase
        .schema("winelio")
        .from("profiles")
        .upsert({
          id: userId,
          email: placeholderEmail,
          is_professional: true,
          city: row.city || null,
          postal_code: row.postalCode || null,
          address: row.address || null,
        });

      if (profileErr) {
        console.error(`❌ [Row ${rowNum}] Profile error for ${name}:`, profileErr.message);
        await supabase.auth.admin.deleteUser(userId);
        errorCount++;
        return;
      }

      // Insert company
      const alias = makeRandomAlias();
      const { error: companyErr } = await supabase
        .schema("winelio")
        .from("companies")
        .insert({
          owner_id: userId,
          name: name,
          alias: alias,
          email: row.email,
          phone: row.phone || null,
          city: row.city || null,
          postal_code: row.postalCode || null,
          address: row.address || null,
          website: row.website || null,
          category_id: categoryId,
          source: "scraped",
          is_verified: false,
          country: "FR",
        });

      if (companyErr) {
        console.error(`❌ [Row ${rowNum}] Company error for ${name}:`, companyErr.message);
        await supabase.auth.admin.deleteUser(userId);
        errorCount++;
        return;
      }

      dbEmails.add(email);
      companyEmails.add(email);
      if (phone) companyPhones.add(phone);

      createdCount++;
      if (createdCount % 20 === 0) {
        console.log(`🔹 Progress: ${createdCount} coaches created...`);
      }
    } catch (err) {
      console.error(`❌ [Row ${rowNum}] Exception for ${name}:`, err.message);
      errorCount++;
    }
  }

  // concurrency = 5
  const queue = [...coachRows];
  const activeWorkers = [];
  let index = 0;

  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift();
      const currentIndex = index++;
      await processRow(row, currentIndex);
    }
  }

  console.log(`📥 Starting import of ${coachRows.length} coaches...`);
  for (let i = 0; i < Math.min(5, queue.length); i++) {
    activeWorkers.push(worker());
  }
  await Promise.all(activeWorkers);

  console.log(`\n============================================================`);
  console.log(`🏁 Coach import complete!`);
  console.log(`   Created successfully : ${createdCount}`);
  console.log(`   Skipped (dupes)      : ${skippedCount}`);
  console.log(`   Errors               : ${errorCount}`);
  console.log(`============================================================`);
}

main().catch(console.error);
