import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

// Génère une URL signée de lecture, valable expiresIn secondes (défaut 1 h).
export async function getAvatarSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn },
  );
}
