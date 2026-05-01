# Autoplay garanti de la vidéo promo + invitation à activer le son

**Date :** 2026-05-01
**Périmètre :** Landing page Winelio (`/`)
**Fichiers concernés :** `src/components/PromoVideo.tsx` uniquement

---

## Contexte

Quand un visiteur arrive sur la landing — typiquement via un lien de
parrainage `?ref=...` — la vidéo de présentation doit démarrer
immédiatement et l'utilisateur doit comprendre clairement qu'il peut
cliquer pour activer le son.

Aujourd'hui, le composant `PromoVideo` tente un autoplay avec son via
un `IntersectionObserver` (seuil 0.3) puis fallback en muted si le
navigateur bloque. La logique fonctionne mais :

1. L'autoplay avec son est rejeté par défaut par tous les navigateurs
   (Chrome, Safari, Firefox) sauf si le domaine a un Media Engagement
   Index élevé — dans 99 % des cas la vidéo finit muted.
2. Aucun call-to-action visible n'invite l'utilisateur à activer le
   son. Il existe seulement un petit bouton discret en bas à droite
   qu'on rate facilement.

## Objectifs

- Démarrage de la vidéo immédiat et fiable, sur tous les navigateurs
  desktop et mobile (y compris Safari iOS).
- Invitation visuelle claire et conviviale pour activer le son.
- Conserver tout le reste du comportement existant (déblocage à 50 %,
  bouton replay, persistance `winelio_promo_watched`).
- S'applique à tous les visiteurs de la landing (pas seulement à ceux
  qui arrivent via `?ref=`).

## Design

### Stratégie d'autoplay

Plutôt que de tenter un autoplay avec son (qui échoue presque
toujours), on s'aligne sur la pratique standard du web :

- Attribut `autoPlay muted playsInline` directement sur l'élément
  `<video>` → autorisé sans condition par tous les navigateurs.
- Suppression de l'`IntersectionObserver` qui devient inutile.
- État initial `muted = true`.

`playsInline` est déjà présent dans le composant — c'est la condition
indispensable pour qu'iOS Safari accepte l'autoplay sans passer en
plein écran.

### Invitation à activer le son

Overlay central cliquable, pattern éprouvé (Instagram, TikTok, X) :

- Pastille semi-transparente centrée sur la vidéo : icône haut-parleur
  + texte court « Activer le son ».
- Animation `pulse` douce, désactivée si l'utilisateur a
  `prefers-reduced-motion` (classe Tailwind `motion-safe:animate-pulse`).
- Cliquable → unmute la vidéo.
- Toute la zone de la vidéo est aussi cliquable pour unmute (zone de
  cible large, plus accessible sur mobile).
- L'overlay disparaît dès le premier unmute et ne réapparaît plus,
  même si l'utilisateur remute via le bouton bas-droit.

### Bouton son existant

Conservé tel quel en bas à droite. Une fois le son activé, il sert
de toggle classique muted ↔ unmuted.

### États du composant

| État | Type | Initial | Rôle |
|------|------|---------|------|
| `muted` | `boolean` | `true` | Reflet de l'état audio courant |
| `hasUnmutedOnce` | `boolean` | `false` | Pose à `true` au premier unmute, masque l'overlay définitivement |
| `ended` | `boolean` | `false` | Inchangé (gestion du bouton replay) |

L'overlay est visible si `muted && !hasUnmutedOnce`.

### Flux utilisateur

1. Visiteur arrive sur la landing.
2. La vidéo démarre automatiquement, muted.
3. L'overlay « 🔊 Activer le son » pulse doucement au centre.
4. L'utilisateur clique n'importe où sur la vidéo (ou sur l'overlay).
5. Le son s'active, l'overlay disparaît.
6. Le bouton bas-droit permet de remute si besoin (sans réafficher
   l'overlay).

## Trade-offs et alternatives écartées

- **Tenter unmuted en premier puis fallback** (logique actuelle) :
  rejeté par les navigateurs dans la quasi-totalité des cas, induit
  un léger délai au démarrage. Abandonné.
- **Badge discret en coin** : trop facile à louper, taux de conversion
  son très bas. Abandonné.
- **Onboarding modal « Activez le son ? »** : intrusif, casse l'effet
  de découverte. Abandonné.
- **Réserver l'overlay aux visiteurs `?ref=`** : pas de raison
  fonctionnelle de différencier, complique le code. Abandonné.

## Tracking et métier (inchangé)

- Déblocage de l'inscription à 50 % (`PROMO_UNLOCK_RATIO`) : conservé.
- Persistance `winelio_promo_watched` en localStorage : conservée.
- Callbacks `onCountdownChange` et `onUnlock` : conservés.

## Accessibilité

- L'overlay et le bouton son disposent tous deux d'un `aria-label`
  explicite.
- L'animation `pulse` est conditionnée à `motion-safe:` pour respecter
  `prefers-reduced-motion`.
- La cible de clic « toute la vidéo » améliore l'accessibilité tactile
  sur mobile.

## Risques

- Aucun navigateur cible (Chrome, Safari desktop, Safari iOS, Firefox)
  ne bloque l'autoplay muted avec `playsInline` → risque très faible.
- Si la vidéo est en cache et démarre instantanément, l'overlay peut
  apparaître brièvement avant que le visiteur ait le temps de
  s'orienter — acceptable car le pulse continue jusqu'au clic.

## Hors périmètre

- Pas de modification de `LandingHero` ni de `page.tsx`.
- Pas de modification de la logique de déblocage à 50 %.
- Pas de tracking analytique du clic « activer le son » (à revoir
  ultérieurement si besoin produit).
