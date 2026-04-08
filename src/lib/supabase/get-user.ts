import { cache } from "react";
import { createClient } from "./server";

/**
 * Retourne l'utilisateur authentifié, mis en cache pour toute la durée du rendu serveur.
 * Évite les appels redondants à auth.getUser() dans le layout ET les pages enfants.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});
