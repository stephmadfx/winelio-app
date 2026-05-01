import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Bucket privé dédié aux photos de profil Winelio. Pas d'URL publique.
// Lecture exclusivement via signed URLs générées côté serveur après auth check.
const R2_ACCOUNT_ID = process.env.R2_AVATARS_ACCOUNT_ID || "c5eb5367f9d0d7332657ff39de420776";
const BUCKET = process.env.R2_AVATARS_BUCKET || "winelio-avatars";

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const akid = process.env.R2_AVATARS_ACCESS_KEY_ID;
  const secret = process.env.R2_AVATARS_SECRET_ACCESS_KEY;
  if (!akid || !secret) {
    throw new Error("R2_AVATARS_ACCESS_KEY_ID / R2_AVATARS_SECRET_ACCESS_KEY manquants en env");
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: akid, secretAccessKey: secret },
  });
  return cachedClient;
}

export async function uploadAvatar(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: "private, max-age=86400",
  }));
}

export async function deleteAvatar(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Récupère le contenu d'un avatar depuis R2 pour le streamer côté serveur.
export async function getAvatarStream(key: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
} | null> {
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType || "application/octet-stream",
      contentLength: res.ContentLength,
    };
  } catch (err) {
    const code = (err as { name?: string; $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === 404) return null;
    throw err;
  }
}
