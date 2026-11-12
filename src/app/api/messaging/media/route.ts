import crypto from "crypto";
import { NextResponse } from "next/server";
import { uploadAvatar } from "@/lib/r2-avatars";
import {
  checkWriteFlood,
  detectSafeImageMime,
  getChannelAccess,
  getMessagingActor,
  MAX_PHOTO_BYTES,
} from "@/lib/messaging";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const actor = await getMessagingActor();
    if (!actor) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (!actor.eligible) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }
    if (!checkWriteFlood(actor.userId)) {
      return NextResponse.json(
        { error: "Trop d'envois rapprochés. Patientez quelques secondes." },
        { status: 429 },
      );
    }

    const formData = await req.formData();
    const channelId = String(formData.get("channelId") || "").trim();
    const file = formData.get("file");

    if (!UUID_RE.test(channelId)) {
      return NextResponse.json({ error: "Salon invalide" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucune image fournie" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json(
        { error: "L'image ne doit pas dépasser 5 Mo." },
        { status: 400 },
      );
    }

    const access = await getChannelAccess(actor, channelId);
    if (!access) {
      return NextResponse.json({ error: "Accès refusé à ce salon" }, { status: 403 });
    }
    if (access.activeRestriction) {
      return NextResponse.json(
        { error: "Votre compte est temporairement en lecture seule sur la messagerie." },
        { status: 403 },
      );
    }
    if (!access.canUploadPhoto) {
      return NextResponse.json(
        { error: "Le partage de photos est réservé aux animateurs dans ce salon." },
        { status: 403 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const detected = detectSafeImageMime(bytes);
    if (!detected) {
      return NextResponse.json(
        { error: "Format d'image non reconnu (JPEG, PNG, WebP ou GIF requis)." },
        { status: 400 },
      );
    }

    const key = `messaging/${channelId}/${Date.now()}-${crypto.randomUUID()}.${detected.ext}`;
    await uploadAvatar(key, bytes, detected.mime);

    return NextResponse.json({
      success: true,
      key,
      mime: detected.mime,
      url: `/api/messaging/media/${key}`,
    });
  } catch (err) {
    console.error("[messaging/media] POST error:", err);
    return NextResponse.json({ error: "Échec de l'envoi de l'image." }, { status: 500 });
  }
}
