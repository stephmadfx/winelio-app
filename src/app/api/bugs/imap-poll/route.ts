import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImapFlow } from "imapflow";
import { uploadToR2 } from "@/lib/r2";

/** Décode le quoted-printable en UTF-8 (séquences multi-octets gérées via TextDecoder) */
function decodeQP(s: string): string {
  s = s.replace(/=\r?\n/g, ""); // soft line breaks
  const parts: string[] = [];
  const bytes: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "=" && i + 2 < s.length && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      if (bytes.length) {
        parts.push(Buffer.from(bytes).toString("utf-8"));
        bytes.length = 0;
      }
      parts.push(s[i]);
      i++;
    }
  }
  if (bytes.length) parts.push(Buffer.from(bytes).toString("utf-8"));
  return parts.join("");
}

/**
 * Extrait le texte brut de la réponse admin depuis le source RFC 2822.
 * Gère les emails multipart (Apple Mail, Gmail) avec quoted-printable.
 */
function extractReplyText(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n");

  // Trouver toutes les sections text/plain (séparées par blank lines)
  // Un email MIME a : outer headers \n\n [boundary \n part-headers \n\n content \n\n ...]
  const candidates: string[] = [];

  // Découper par double saut de ligne pour isoler les blocs headers/contenu
  const blocks = normalized.split(/\n\n+/);

  let isQP = false;
  let isTextPlain = true;

  for (const block of blocks) {
    const trimmed = block.trim();
    // Bloc de headers MIME (chaque ligne commence par Header: ou est un fold)
    if (/^[\w-]+:/m.test(trimmed) && trimmed.split("\n").every(l => /^[\w-]+:|^\s/.test(l) || l.trim() === "")) {
      isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(trimmed);
      isTextPlain = !trimmed.includes("Content-Type:") || /Content-Type:\s*text\/plain/i.test(trimmed);
      continue;
    }

    if (!isTextPlain) continue;

    let text = isQP ? decodeQP(trimmed) : trimmed;

    // Filtrer les lignes citées et signatures
    text = text
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return (
          !t.startsWith(">") &&
          !/^On .+wrote:/.test(t) &&
          !/^Le .+ a écrit/.test(t) &&
          !t.startsWith("--") &&
          // Ignorer les MIME boundaries résiduelles
          !/^-{2,}/.test(t)
        );
      })
      .join("\n")
      .trim();

    if (text) candidates.push(text);
  }

  return candidates[0] ?? "";
}

/**
 * Extrait les images base64 attachées dans le source MIME brut.
 * Retourne un tableau de { data, mime, ext }.
 */
function extractImagesFromRaw(raw: string): Array<{ data: Buffer; mime: string; ext: string }> {
  const normalized = raw.replace(/\r\n/g, "\n");
  const results: Array<{ data: Buffer; mime: string; ext: string }> = [];
  const blocks = normalized.split("\n\n");

  for (let i = 0; i < blocks.length - 1; i++) {
    const header = blocks[i];
    const mimeMatch = header.match(/Content-Type:\s*(image\/[\w+.-]+)/i);
    if (!mimeMatch) continue;
    if (!/Content-Transfer-Encoding:\s*base64/i.test(header)) continue;

    const mime = mimeMatch[1].toLowerCase();
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const base64 = blocks[i + 1]?.replace(/\s/g, "");
    if (!base64 || base64.length < 100) continue;

    try {
      results.push({ data: Buffer.from(base64, "base64"), mime, ext });
    } catch { /* ignorer */ }
  }

  return results;
}

export async function GET(req: NextRequest) {
  // Sécurité : vérifier le CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = process.env.IMAP_HOST || "ssl0.ovh.net";
  const port = Number(process.env.IMAP_PORT) || 993;
  const user = process.env.IMAP_USER || "support@winelio.app";
  const pass = process.env.IMAP_PASS || "";

  if (!pass) {
    return NextResponse.json({ error: "IMAP_PASS not configured" }, { status: 500 });
  }

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  let processed = 0;
  let errors = 0;
  const debug: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Chercher TOUS les emails avec [Bug #UUID] dans le sujet
      // (pas seulement non-lus — Apple Mail peut les marquer lus avant le cron)
      const allUids = await client.search({ all: true }, { uid: true });
      const uids: number[] = Array.isArray(allUids) ? allUids : [];
      debug.push(`uids: ${uids.length}`);

      // Récupérer les rapports encore en attente pour éviter des requêtes inutiles
      const { data: pendingReports } = await supabaseAdmin
        .from("bug_reports")
        .select("id")
        .eq("status", "pending");
      const pendingIds = new Set((pendingReports ?? []).map((r: { id: string }) => r.id));

      if (pendingIds.size === 0) {
        // Aucun rapport en attente, rien à faire
      } else {
        for (const uid of uids) {
          try {
            const msg = await client.fetchOne(
              String(uid),
              { envelope: true, source: true },
              { uid: true }
            );

            if (!msg) continue;
            const typedMsg = msg as { envelope?: { subject?: string }; source?: Buffer };
            const subject = typedMsg.envelope?.subject ?? "";
            debug.push(`[${uid}] ${subject.substring(0, 80)}`);

            // Ne traiter que les RÉPONSES admin : sujet doit commencer par "Re:"
            // (l'email original du bug report a aussi [Bug #UUID] dans le sujet — on l'ignore)
            if (!/^Re\s*:/i.test(subject)) continue;

            const match = subject.match(/\[Bug #([0-9a-f-]{36})\]/i);
            if (!match) continue;

            const reportId = match[1];

            // Ne traiter que les rapports encore en attente
            if (!pendingIds.has(reportId)) continue;

            const rawSource = typedMsg.source?.toString("utf-8") ?? "";
            const replyText = extractReplyText(rawSource).substring(0, 2000);

            if (!replyText) continue;

            // Extraire et uploader les images attachées sur R2
            const imageUrls: string[] = [];
            try {
              const images = extractImagesFromRaw(rawSource);
              for (const { data, mime, ext } of images.slice(0, 5)) { // max 5 images
                const key = `winelio/bug-replies/${reportId}/${Date.now()}-${imageUrls.length}.${ext}`;
                const url = await uploadToR2(key, data, mime);
                imageUrls.push(url);
              }
            } catch (imgErr) {
              console.error("[imap-poll] Erreur upload image:", imgErr);
            }

            const { error: dbError } = await supabaseAdmin
              .from("bug_reports")
              .update({
                status: "replied",
                admin_reply: replyText,
                reply_images: imageUrls.length > 0 ? imageUrls : undefined,
                replied_at: new Date().toISOString(),
              })
              .eq("id", reportId)
              .eq("status", "pending");

            if (!dbError) {
              processed++;
              pendingIds.delete(reportId); // éviter double traitement si deux emails pour le même rapport
            }
          } catch (msgErr) {
            console.error(`[imap-poll] Erreur message uid=${uid}:`, msgErr);
            errors++;
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("[imap-poll] Erreur IMAP:", err);
    return NextResponse.json({ error: "IMAP connection failed", details: String(err) }, { status: 500 });
  }

  return NextResponse.json({ success: true, processed, errors, debug });
}
