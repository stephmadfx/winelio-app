import { randomUUID } from "crypto";
import { uploadToR2 } from "@/lib/r2";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

export const uploadNewsletterImage = async (file: File) => {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Format image non supporté");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Image trop lourde : maximum 4 Mo");
  }

  const ext = file.type.split("/")[1] || "png";
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadToR2(`winelio/newsletters/${randomUUID()}.${ext}`, buffer, file.type);
};
