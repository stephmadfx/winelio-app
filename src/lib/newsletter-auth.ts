import { createClient } from "@/lib/supabase/server";

export const assertNewsletterAdmin = async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Non authentifié");
  }

  if (user.app_metadata?.role !== "super_admin") {
    throw new Error("Accès refusé");
  }

  return user;
};
