# Avatar Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un recadrage 1:1 avec `react-image-crop` avant upload, résoudre la lenteur d'affichage via resize WebP côté client, et améliorer l'UX de la section avatar.

**Architecture:** Nouveau composant `AvatarCropModal` isolé qui reçoit un blob URL, laisse l'utilisateur ajuster le cadre 1:1, exporte via Canvas en WebP 400×400 px, et retourne un Blob à `profile-form.tsx`. La route API `/api/profile/avatar` est inchangée.

**Tech Stack:** `react-image-crop` (v11+), Canvas API (WebP export), Next.js 15 App Router, Tailwind CSS v4

---

## Fichiers concernés

| Fichier | Action |
|---|---|
| `src/components/avatar-crop-modal.tsx` | Créer |
| `src/components/profile-form.tsx` | Modifier |
| `package.json` | Ajouter dépendance |

---

## Task 1 : Installer react-image-crop

**Files:**
- Modify: `package.json`

- [ ] **Step 1 : Installer la dépendance**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm install react-image-crop
```

Résultat attendu : `react-image-crop` apparaît dans `dependencies` de `package.json`.

- [ ] **Step 2 : Vérifier l'installation**

```bash
ls node_modules/react-image-crop/dist/ReactCrop.css
```

Résultat attendu : le fichier existe.

- [ ] **Step 3 : Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install react-image-crop"
```

---

## Task 2 : Créer AvatarCropModal

**Files:**
- Create: `src/components/avatar-crop-modal.tsx`

- [ ] **Step 1 : Créer le composant**

Créer `src/components/avatar-crop-modal.tsx` avec ce contenu exact :

```tsx
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
```

- [ ] **Step 2 : Commit**

```bash
git add src/components/avatar-crop-modal.tsx
git commit -m "feat(profile): créer AvatarCropModal avec react-image-crop (1:1, WebP 400px)"
```

---

## Task 3 : Modifier profile-form.tsx

**Files:**
- Modify: `src/components/profile-form.tsx`

Les modifications concernent uniquement la section avatar (lignes 58-59, 164-201, 241-287).

- [ ] **Step 1 : Ajouter l'import du modal**

En haut du fichier, ajouter après la ligne `import { ProfileAvatar } from "@/components/profile-avatar";` :

```tsx
import { AvatarCropModal } from "@/components/avatar-crop-modal";
```

- [ ] **Step 2 : Ajouter l'état cropSrc**

Dans le bloc des `useState` (vers ligne 58), ajouter après `const [avatarUploading, setAvatarUploading] = useState(false);` :

```tsx
const [cropSrc, setCropSrc] = useState<string | null>(null);
```

- [ ] **Step 3 : Remplacer la fonction uploadAvatar**

Remplacer entièrement la fonction `uploadAvatar` (lignes 164-201) par :

```tsx
const uploadAvatar = async (blob: Blob) => {
  setCropSrc(null);
  setAvatarUploading(true);
  setMessage(null);
  try {
    const formData = new FormData();
    formData.append("file", blob, "avatar.webp");
    const res = await fetch("/api/profile/avatar", {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ type: "error", text: data.error || "Impossible d'envoyer la photo. Réessayez." });
      return;
    }
    setAvatarPreview(data.publicUrl ?? null);
    setMessage({ type: "success", text: "Photo de profil mise à jour." });
    router.refresh();
  } finally {
    setAvatarUploading(false);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }
};
```

- [ ] **Step 4 : Remplacer la section avatar dans le JSX**

Remplacer le bloc `{/* Photo de profil */}` (de `<div className="bg-white rounded-2xl...">` jusqu'à `</div>` de fermeture de ce bloc, lignes 241-287) par :

```tsx
{/* Photo de profil */}
<div className="bg-white rounded-2xl border border-gray-200 p-6">
  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
    {/* Avatar cliquable avec badge */}
    <button
      type="button"
      onClick={() => avatarInputRef.current?.click()}
      disabled={avatarUploading}
      className="relative h-20 w-20 shrink-0 self-center cursor-pointer rounded-full disabled:opacity-50"
      aria-label="Changer la photo de profil"
    >
      <ProfileAvatar
        name={`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || userEmail}
        avatar={avatarPreview}
        className="h-20 w-20 ring-4 ring-winelio-orange/10"
        initialsClassName="text-lg font-extrabold"
      />
      <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-winelio-orange to-winelio-amber text-xs">
        ✏️
      </span>
    </button>

    <div className="flex-1 min-w-0">
      <h3 className="text-lg font-semibold text-winelio-dark">Photo de profil</h3>
      <p className="mt-1 text-sm text-winelio-gray">
        Recadrée en carré et optimisée automatiquement.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          disabled={avatarUploading}
          className="px-4 py-2.5 bg-gradient-to-r from-winelio-orange to-winelio-amber text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {avatarUploading ? "Envoi..." : (avatarPreview ? "Changer la photo" : "Ajouter une photo")}
        </button>
        {avatarPreview && (
          <button
            type="button"
            onClick={removeAvatar}
            disabled={avatarUploading}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Supprimer
          </button>
        )}
      </div>
    </div>
  </div>

  <input
    ref={avatarInputRef}
    type="file"
    accept="image/*"
    className="hidden"
    onChange={(e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setMessage({ type: "error", text: "Merci de choisir une image valide." });
        return;
      }
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setCropSrc(reader.result as string);
      });
      reader.readAsDataURL(file);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }}
  />
</div>

{/* Modal de recadrage */}
{cropSrc && (
  <AvatarCropModal
    imageSrc={cropSrc}
    onComplete={uploadAvatar}
    onCancel={() => setCropSrc(null)}
  />
)}
```

- [ ] **Step 5 : Vérifier que removeAvatar utilise avatarPreview (pas profile.avatar)**

Dans la condition d'affichage du bouton "Supprimer", on utilise `avatarPreview` (état local) et non `profile.avatar` (prop serveur). Vérifier que c'est bien le cas dans le JSX ci-dessus. ✓

- [ ] **Step 6 : Commit**

```bash
git add src/components/profile-form.tsx
git commit -m "feat(profile): intégrer AvatarCropModal + badge + flux WebP"
```

---

## Task 4 : Build et test local

- [ ] **Step 1 : Vérifier que le build passe**

```bash
cd /Users/steph/PROJETS/WINELIO/winelio
npm run build
```

Résultat attendu : build sans erreur TypeScript ni erreur Next.js.

- [ ] **Step 2 : Relancer PM2**

```bash
pm2 restart winelio
```

Attendre 5 secondes puis vérifier les logs :

```bash
pm2 logs winelio --lines 20
```

Résultat attendu : aucune erreur de compilation.

- [ ] **Step 3 : Tester manuellement dans le navigateur**

Ouvrir http://localhost:3002/profile et vérifier :
1. Le badge ✏️ est visible sur l'avatar
2. Cliquer sur "Changer la photo" ou sur le badge → sélecteur de fichier s'ouvre
3. Sélectionner une image → la modal de recadrage s'ouvre
4. Ajuster le cadre → l'aperçu se met à jour en temps réel
5. Cliquer "Recadrer et enregistrer" → photo mise à jour, modal se ferme
6. La nouvelle photo s'affiche immédiatement sans rechargement de page
7. Cliquer "Supprimer" → photo supprimée, retour aux initiales

---

## Task 5 : Push dev et main

- [ ] **Step 1 : Push sur dev2**

```bash
git push origin dev2
```

- [ ] **Step 2 : Vérifier le déploiement sur dev2**

```bash
pm2 logs winelio --lines 30
```

Attendre la fin du build Coolify (~2 min), puis tester sur https://dev2.winelio.app/profile.

- [ ] **Step 3 : Push sur main (production)**

```bash
git push origin dev2:main --force
```

- [ ] **Step 4 : Vérifier le déploiement production**

Attendre la fin du build Coolify (~2 min), puis tester sur https://winelio.app/profile.
