// src/lib/generate-signed-pdf.ts
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { supabaseAdmin } from "@/lib/supabase/admin";

const execFileAsync = promisify(execFile);

export async function generateSignedPDF(params: {
  documentId: string;
  signerName: string;
  signatureImageUrl: string;
  signedAt: Date;
  ip: string;
  documentHash: string;
}): Promise<Buffer> {
  const html = await buildSignedPdfHtml(params);
  const tmpHtml = join(tmpdir(), `sign-${Date.now()}.html`);
  const tmpPdf = join(tmpdir(), `sign-${Date.now()}.pdf`);
  try {
    await writeFile(tmpHtml, html, "utf-8");
    await execFileAsync("weasyprint", [tmpHtml, tmpPdf]);
    return await readFile(tmpPdf);
  } finally {
    await unlink(tmpHtml).catch(() => {});
    await unlink(tmpPdf).catch(() => {});
  }
}

async function buildSignedPdfHtml(params: {
  documentId: string;
  signerName: string;
  signatureImageUrl: string;
  signedAt: Date;
  ip: string;
  documentHash: string;
}): Promise<string> {
  const { data: doc } = await supabaseAdmin
    .from("legal_documents")
    .select("title, version")
    .eq("id", params.documentId)
    .single();

  const { data: sections } = await supabaseAdmin
    .from("document_sections")
    .select("order_index, article_number, title, content")
    .eq("document_id", params.documentId)
    .order("order_index");

  const docTitle = doc?.title ?? "Document légal";
  const docVersion = doc?.version ?? "1.0";

  const sectionsHtml = (sections ?? [])
    .map(
      (s) => `
    <section>
      <h2>Article ${escapeHtml(s.article_number)} — ${escapeHtml(s.title)}</h2>
      <div class="content">${markdownToHtml(s.content)}</div>
    </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(docTitle)} v${escapeHtml(docVersion)}</title>
  <style>
    body { font-family: Georgia, serif; font-size: 11pt; color: #1a1a1a; margin: 2cm; }
    h1 { font-size: 16pt; text-align: center; color: #FF6B35; margin-bottom: 0.5cm; }
    .subtitle { text-align: center; color: #636E72; font-size: 10pt; margin-bottom: 1cm; }
    h2 { font-size: 12pt; color: #2D3436; margin-top: 0.8cm; border-bottom: 1px solid #eee; padding-bottom: 2pt; }
    .content { line-height: 1.6; }
    .signature-block { margin-top: 1.5cm; border-top: 2px solid #FF6B35; padding-top: 0.5cm; page-break-inside: avoid; }
    .signature-block h3 { color: #FF6B35; font-size: 12pt; }
    .sig-image { max-width: 200px; max-height: 80px; border: 1px solid #ccc; border-radius: 4px; margin: 0.3cm 0; }
    .sig-meta { font-size: 9pt; color: #636E72; line-height: 1.8; }
    .sig-hash { font-family: monospace; font-size: 8pt; word-break: break-all; color: #636E72; }
  </style>
</head>
<body>
  <h1>${escapeHtml(docTitle)}</h1>
  <p class="subtitle">Version ${escapeHtml(docVersion)} — Document certifié</p>
  ${sectionsHtml}
  <div class="signature-block">
    <h3>Signature électronique</h3>
    <img class="sig-image" src="${escapeHtml(params.signatureImageUrl)}" alt="Signature" />
    <div class="sig-meta">
      <strong>Signataire :</strong> ${escapeHtml(params.signerName)}<br />
      <strong>Date :</strong> ${escapeHtml(params.signedAt.toISOString())}<br />
      <strong>Adresse IP :</strong> ${escapeHtml(params.ip)}<br />
      <strong>Empreinte SHA-256 du document :</strong>
    </div>
    <div class="sig-hash">${escapeHtml(params.documentHash)}</div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Minimal Markdown → HTML : bold **text**, bullet lists, line breaks */
function markdownToHtml(text: string): string {
  let result = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>");

  // Convert list items to ul (handle multi-line)
  result = result.replace(/<li>[^]*?<\/li>/g, (match) => `<ul>${match}</ul>`);

  return result
    .replace(/\n\n/g, "</p><p>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}
