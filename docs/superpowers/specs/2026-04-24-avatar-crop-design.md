# Spec — Gestion photo de profil avec recadrage

## Contexte

Les utilisateurs se plaignent de la lenteur d'affichage des photos de profil (upload brut jusqu'à 5 Mo sans resize). Il manque également un outil de recadrage avant upload.

## Objectifs

1. Recadrage 1:1 avant upload via modal `react-image-crop` (handles aux coins, grille des tiers)
2. Résolution de la lenteur : resize côté client (canvas → WebP, max 400×400 px, ~25 Ko)
3. UX : badge ✏️ cliquable sur l'avatar, boutons "Changer" et "Supprimer" toujours visibles

## Ce qui ne change pas

- Route `POST /api/profile/avatar` — reçoit toujours un FormData avec un fichier
- Route `DELETE /api/profile/avatar` — suppression inchangée
- `ProfileAvatar` — composant d'affichage inchangé
- `profile-avatar.ts` — helpers inchangés

## Nouveaux composants

### `AvatarCropModal`

Composant client `src/components/avatar-crop-modal.tsx` :
- Props : `imageSrc: string`, `onComplete(blob: Blob): void`, `onCancel(): void`
- Utilise `react-image-crop` avec `aspect={1}` (ratio 1:1 forcé, non modifiable)
- Aperçu en temps réel (deux cercles 36 px et 28 px)
- Boutons : "Annuler" et "Recadrer et enregistrer →"
- Export via Canvas : `canvasPreview()` → Blob WebP qualité 0.85, max 400×400 px

## Modifications à `profile-form.tsx`

1. Import de `AvatarCropModal`
2. État `cropSrc: string | null` — contient l'URL blob de l'image sélectionnée
3. Flux : sélection fichier → lecture FileReader → `cropSrc` renseigné → modal s'ouvre
4. À la validation : canvas → WebP Blob → FormData → `POST /api/profile/avatar`
5. Badge ✏️ sur l'avatar (overlay semi-transparent au clic)
6. Bouton "Changer" toujours visible (texte dynamique si aucun avatar)

## Flux complet

```
① Clic "Changer" / badge ✏️
→ ② Input file (accept="image/*")
→ ③ FileReader → blob URL → cropSrc
→ ④ AvatarCropModal s'ouvre
→ ⑤ Utilisateur ajuste le cadre (handles + grille des tiers)
→ ⑥ "Recadrer et enregistrer" → canvas.toBlob("image/webp", 0.85)
→ ⑦ FormData → POST /api/profile/avatar
→ ⑧ avatarPreview mis à jour → affichage instantané
```

## Performance

- Avant : upload JPEG/PNG brut (≤5 Mo), latence Supabase Storage visible
- Après : WebP 400×400 px (~20–35 Ko), affichage quasi-instantané

## Dépendances à installer

```
npm install react-image-crop
```

Types inclus dans le package.

## Fichiers concernés

| Fichier | Action |
|---|---|
| `src/components/avatar-crop-modal.tsx` | Créer |
| `src/components/profile-form.tsx` | Modifier (crop + badge + UX) |
| `package.json` | Ajouter `react-image-crop` |
