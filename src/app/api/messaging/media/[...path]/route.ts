import { NextRequest, NextResponse } from "next/server";
import { getAvatarStream } from "@/lib/r2-avatars";
import { getChannelAccess, getMessagingActor } from "@/lib/messaging";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_FILE_RE = /^[a-zA-Z0-9._-]+$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    if (!Array.isArray(path) || path.length < 2) {
      return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
    }

    // Format attendu : ["messaging", "<channelId>", "<filename>"]
    const offset = path[0] === "messaging" ? 1 : 0;
    const channelId = path[offset];
    const filename = path[offset + 1];

    if (
      !channelId ||
      !filename ||
      path.length !== offset + 2 ||
      !UUID_RE.test(channelId) ||
      !SAFE_FILE_RE.test(filename)
    ) {
      return NextResponse.json({ error: "Chemin média invalide" }, { status: 400 });
    }

    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const access = await getChannelAccess(actor, channelId);
    if (!access) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const r2Key = `messaging/${channelId}/${filename}`;
    const stream = await getAvatarStream(r2Key);
    if (!stream) {
      return NextResponse.json({ error: "Image introuvable" }, { status: 404 });
    }

    const headers: Record<string, string> = {
      "Content-Type": stream.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    };
    if (stream.contentLength) {
      headers["Content-Length"] = String(stream.contentLength);
    }

    return new Response(stream.body, { status: 200, headers });
  } catch (err) {
    console.error("[messaging/media/stream] GET error:", err);
    return NextResponse.json({ error: "Image indisponible" }, { status: 500 });
  }
}
