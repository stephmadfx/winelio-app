import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "ssl0.ovh.net",
    port: Number(process.env.IMAP_PORT) || 993,
    secure: true,
    auth: { user: process.env.IMAP_USER || "support@winelio.app", pass: process.env.IMAP_PASS || "" },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const subjects: string[] = [];
    try {
      const allUids = await client.search({ all: true }, { uid: true });
      const uids: number[] = Array.isArray(allUids) ? allUids : [];
      for (const uid of uids.slice(-20)) { // 20 derniers
        const msg = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
        const typedMsg = msg as { envelope?: { subject?: string } };
        subjects.push(`[${uid}] ${typedMsg.envelope?.subject ?? "(no subject)"}`);
      }
    } finally {
      lock.release();
    }
    await client.logout();
    return NextResponse.json({ count: subjects.length, subjects });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
