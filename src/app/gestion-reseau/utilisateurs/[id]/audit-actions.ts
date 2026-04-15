// src/app/gestion-reseau/utilisateurs/[id]/audit-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { getDocumentHash } from "@/lib/audit";

export async function verifyDocumentIntegrity(
  documentId: string,
  storedHash: string
): Promise<{ unchanged: boolean; notFound?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = (user as { app_metadata?: { role?: string } } | null)?.app_metadata?.role;
  if (role !== "super_admin") throw new Error("Accès non autorisé");

  const current = await getDocumentHash(documentId);
  if (!current) return { unchanged: false, notFound: true };
  return { unchanged: current.hash === storedHash };
}
