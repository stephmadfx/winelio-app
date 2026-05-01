/**
 * One-off test: simule la complétion de fiche pro d'un filleul existant
 * pour vérifier que `notifyNewProInNetwork` envoie bien le mail au parrain N1.
 *
 * Usage:
 *   npx tsx scripts/test-notify-new-pro.ts <filleulUserId>
 *
 * Charge les env de .env.local automatiquement.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyNewProInNetwork } from "@/lib/notify-new-pro-in-network";

async function main() {
  const filleulId = process.argv[2];
  if (!filleulId) {
    console.error("Usage: tsx scripts/test-notify-new-pro.ts <filleulUserId>");
    process.exit(1);
  }

  // 1. Récupérer le filleul + son sponsor
  const { data: filleul } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, sponsor_id, is_professional, avatar")
    .eq("id", filleulId)
    .single();

  if (!filleul) {
    console.error("Filleul introuvable :", filleulId);
    process.exit(1);
  }
  if (!filleul.sponsor_id) {
    console.error("Ce filleul n'a pas de sponsor — impossible de tester.");
    process.exit(1);
  }

  console.log("Filleul :", filleul.first_name, filleul.last_name, "(avatar:", !!filleul.avatar, ")");
  console.log("Sponsor ID :", filleul.sponsor_id);
  console.log("is_professional avant :", filleul.is_professional);

  // 2. Flip is_professional -> true si pas déjà fait (simule la fin du wizard)
  if (!filleul.is_professional) {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_professional: true })
      .eq("id", filleulId);
    if (error) {
      console.error("Erreur update is_professional :", error.message);
      process.exit(1);
    }
    console.log("→ is_professional passé à true");
  }

  // 3. Appel direct du notify
  console.log("Envoi de la notification...");
  const sent = await notifyNewProInNetwork(filleulId, {
    categoryName: "Test catégorie",
    workMode: "both",
  });
  console.log("Résultat notifyNewProInNetwork :", sent);

  // 4. Vérifier l'entrée dans email_queue
  const { data: queued } = await supabaseAdmin
    .schema("winelio")
    .from("email_queue")
    .select("id, to_email, subject, status, created_at")
    .order("created_at", { ascending: false })
    .limit(3);

  console.log("\n3 derniers emails en file d'attente :");
  console.table(queued);
}

main().catch((err) => {
  console.error("Erreur :", err);
  process.exit(1);
});
