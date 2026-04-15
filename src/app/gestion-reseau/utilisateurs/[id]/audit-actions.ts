// src/app/gestion-reseau/utilisateurs/[id]/audit-actions.ts
"use server";

import { getDocumentHash } from "@/lib/audit";

export async function verifyDocumentIntegrity(
  documentId: string,
  storedHash: string
): Promise<{ unchanged: boolean; notFound?: boolean }> {
  const current = await getDocumentHash(documentId);
  if (!current) return { unchanged: false, notFound: true };
  return { unchanged: current.hash === storedHash };
}
