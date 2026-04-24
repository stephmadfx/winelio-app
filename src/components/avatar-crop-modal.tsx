"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, {
  type Crop,
  type PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

type Props = {
  imageSrc: string;
  onComplete: (blob: Blob) => void;
  onCancel: () => void;
};

function centerAspectCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, 1, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

async function cropToBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const SIZE = 400;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    SIZE,
    SIZE
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/webp",
      0.85
    );
  });
}

function PreviewCanvas({
  image,
  crop,
  size,
}: {
  image: HTMLImageElement;
  crop: PixelCrop;
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      size,
      size
    );
  }, [image, crop, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        borderRadius: "50%",
        border: "2px solid rgba(255,107,53,0.3)",
        flexShrink: 0,
      }}
    />
  );
}

export function AvatarCropModal({ imageSrc, onComplete, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [processing, setProcessing] = useState(false);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height));
  }, []);

  const handleApply = async () => {
    if (!imgRef.current || !completedCrop) return;
    setProcessing(true);
    try {
      const blob = await cropToBlob(imgRef.current, completedCrop);
      onComplete(blob);
    } catch {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white">
        <div className="h-1 bg-gradient-to-r from-winelio-orange to-winelio-amber" />
        <div className="p-5">
          <h3 className="text-base font-bold text-winelio-dark">Recadrer la photo</h3>
          <p className="mt-1 text-xs text-winelio-gray">
            Déplacez les poignées pour ajuster le cadre · Format carré 1:1
          </p>

          <div className="mt-4 flex max-h-80 items-center justify-center overflow-auto rounded-lg bg-[#1a1a2e]">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Recadrage"
                onLoad={onImageLoad}
                style={{ maxHeight: "320px", maxWidth: "100%" }}
              />
            </ReactCrop>
          </div>

          {completedCrop && imgRef.current && (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-winelio-light px-3 py-2.5">
              <span className="shrink-0 text-xs text-winelio-gray">Aperçu :</span>
              <PreviewCanvas image={imgRef.current} crop={completedCrop} size={36} />
              <PreviewCanvas image={imgRef.current} crop={completedCrop} size={28} />
              <span className="text-xs text-winelio-gray/70">~25 Ko · WebP 400×400 px</span>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-winelio-gray transition-colors hover:bg-gray-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!completedCrop || processing}
              className="flex-[2] rounded-xl bg-gradient-to-r from-winelio-orange to-winelio-amber py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {processing ? "Traitement..." : "Recadrer et enregistrer →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
