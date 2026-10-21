import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { htmlToPdf } from "@/lib/html-to-pdf";
import { accountingDocumentHtml, type AccountingDocument } from "@/lib/accounting-document-template";

export async function accountingDocumentPdf(document: AccountingDocument): Promise<Buffer> {
  const { data: existing, error: readError } = await supabaseAdmin.from("accounting_document_files")
    .select("pdf_base64").eq("document_id", document.id).maybeSingle();
  if (readError) throw new Error("Lecture de l’archive PDF impossible");
  if (existing) return Buffer.from(existing.pdf_base64, "base64");

  const pdf = await htmlToPdf(await accountingDocumentHtml(document));
  const { error: insertError } = await supabaseAdmin.from("accounting_document_files").insert({
    document_id: document.id, pdf_base64: pdf.toString("base64"),
    sha256: createHash("sha256").update(pdf).digest("hex"),
  });
  // Deux téléchargements simultanés : retourner les mêmes octets archivés.
  if (insertError && insertError.code !== "23505") throw new Error("Archivage du PDF impossible");
  const { data: archived, error } = await supabaseAdmin.from("accounting_document_files")
    .select("pdf_base64").eq("document_id", document.id).single();
  if (error || !archived) throw new Error("Relecture de l’archive PDF impossible");
  return Buffer.from(archived.pdf_base64, "base64");
}

export async function archiveAccountingDocument(kind: "invoice" | "payout", sourceId: string) {
  const { data, error } = await supabaseAdmin.from("accounting_documents").select("*")
    .eq("kind", kind).eq("source_id", sourceId).maybeSingle();
  if (error) throw new Error("Lecture du document à archiver impossible");
  if (data) await accountingDocumentPdf(data as AccountingDocument);
}
