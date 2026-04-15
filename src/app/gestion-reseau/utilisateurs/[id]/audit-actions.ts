// src/app/gestion-reseau/utilisateurs/[id]/audit-actions.ts
"use server";

import { getDocumentHash } from "@/lib/audit";

export async function verifyDocumentIntegrity(
  documentId: string,
  storedHash: string
): Promise<{ unchanged: boolean }> {
  const current = await getDocumentHash(documentId);
  if (!current) return { unchanged: false };
  return { unchanged: current.hash === storedHash };
}
