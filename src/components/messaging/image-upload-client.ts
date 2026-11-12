export type UploadedMessagingAttachment = {
  key: string;
  mime: string;
  url: string;
  width: number;
  height: number;
};

const MAX_DIMENSION = 1600;

async function decodeAndResizeImage(
  file: File,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const srcW = bitmap.width || 800;
  const srcH = bitmap.height || 600;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Impossible de préparer l'image.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (webpBlob) => {
        if (webpBlob && webpBlob.type === "image/webp") {
          resolve(webpBlob);
          return;
        }
        canvas.toBlob(
          (jpgBlob) => {
            if (jpgBlob) resolve(jpgBlob);
            else reject(new Error("Compression de l'image impossible."));
          },
          "image/jpeg",
          0.86,
        );
      },
      "image/webp",
      0.84,
    );
  });

  return { blob, width, height };
}

export async function uploadMessagingPhoto(
  channelId: string,
  file: File,
): Promise<UploadedMessagingAttachment> {
  const { blob, width, height } = await decodeAndResizeImage(file);
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const cleanedFile = new File([blob], `photo.${ext}`, { type: blob.type });

  const formData = new FormData();
  formData.set("channelId", channelId);
  formData.set("file", cleanedFile);

  const res = await fetch("/api/messaging/media", {
    method: "POST",
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    key?: string;
    mime?: string;
    url?: string;
  };

  if (!res.ok || !data.key || !data.url) {
    throw new Error(data.error || "Échec de l'envoi de la photo.");
  }

  return {
    key: data.key,
    mime: data.mime || blob.type,
    url: data.url,
    width,
    height,
  };
}
