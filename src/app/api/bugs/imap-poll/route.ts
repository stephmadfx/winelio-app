import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImapFlow } from "imapflow";

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

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Chercher TOUS les emails avec [Bug #UUID] dans le sujet
      // (pas seulement non-lus — Apple Mail peut les marquer lus avant le cron)
      const allUids = await client.search({ all: true }, { uid: true });
      const uids: number[] = Array.isArray(allUids) ? allUids : [];

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

            // Chercher [Bug #UUID] — présent dans les réponses "Re: [Bug #UUID]..."
            const match = subject.match(/\[Bug #([0-9a-f-]{36})\]/i);
            if (!match) continue;

            const reportId = match[1];

            // Ne traiter que les rapports encore en attente
            if (!pendingIds.has(reportId)) continue;

            const rawSource = typedMsg.source?.toString("utf-8") ?? "";

            // Séparer headers et corps (RFC 2822 : ligne vide entre les deux)
            const headerBodySep = rawSource.indexOf("\r\n\r\n") >= 0
              ? rawSource.indexOf("\r\n\r\n") + 4
              : rawSource.indexOf("\n\n") >= 0
                ? rawSource.indexOf("\n\n") + 2
                : 0;
            const bodyOnly = rawSource.substring(headerBodySep);

            // Extraire uniquement le texte de la réponse (ignorer les citations et signatures)
            const replyText = bodyOnly
              .replace(/\r\n/g, "\n")
              .split("\n")
              .filter((line) => {
                const trimmed = line.trim();
                return (
                  !trimmed.startsWith(">") &&
                  !/^On .+wrote:$/s.test(trimmed) &&
                  !/^Le .+ a écrit\s*:/.test(trimmed) &&
                  !trimmed.startsWith("--")
                );
              })
              .join("\n")
              .trim()
              .substring(0, 2000);

            if (!replyText) continue;

            const { error: dbError } = await supabaseAdmin
              .from("bug_reports")
              .update({
                status: "replied",
                admin_reply: replyText,
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

  return NextResponse.json({ success: true, processed, errors });
}
