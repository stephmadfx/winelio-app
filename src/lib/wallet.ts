import { supabaseAdmin } from "@/lib/supabase/admin";

/** Recalcule les soldes sans libérer les retraits réservés ni écraser un mouvement concurrent. */
export async function recalculateWallet(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc("recalculate_wallet", { p_user_id: userId });
  if (error) throw new Error("Impossible de recalculer le portefeuille");
}
