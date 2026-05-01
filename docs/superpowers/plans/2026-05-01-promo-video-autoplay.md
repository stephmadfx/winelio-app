# Promo Video Autoplay + Sound Invitation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La vidéo de présentation démarre automatiquement (muted) dès l'arrivée sur la landing, avec une invitation centrale visible « Activer le son » qui débloque le son au clic.

**Architecture:** Refactor d'un seul composant client React (`PromoVideo.tsx`). Suppression de l'`IntersectionObserver` devenu inutile, ajout d'attributs HTML `autoPlay muted`, ajout d'un overlay central cliquable + zone vidéo cliquable pour unmute. Tout le reste du composant (déblocage à 50 %, replay, persistance localStorage) reste inchangé.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4. Aucun framework de tests unitaires dans le projet — vérification via `npm run lint`, `npm run build` et test visuel manuel via Chrome MCP.

**Spec source:** `docs/superpowers/specs/2026-05-01-promo-video-autoplay-design.md`

---

## File Structure

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `src/components/PromoVideo.tsx` | Modifier | Nouveau comportement autoplay muted + overlay « Activer le son » |

Aucun autre fichier n'est touché. La signature publique du composant (props `onCountdownChange`, `onUnlock`) et les exports (`PROMO_WATCHED_KEY`, `PROMO_UNLOCK_RATIO`) sont conservés à l'identique pour ne pas casser `LandingHero`.

---

## Task 1 : Refactor PromoVideo — autoplay muted garanti + overlay sonore

**Files:**
- Modify: `src/components/PromoVideo.tsx` (réécriture complète du composant, exports inchangés)

### Comportement cible

1. La vidéo monte avec `autoPlay muted playsInline` → démarre seule sur tous les navigateurs.
2. État initial `muted = true` (au lieu de `false` aujourd'hui).
3. Suppression de l'`IntersectionObserver` (effet `useEffect` lignes 32-52 du fichier actuel).
4. Nouvel état `hasUnmutedOnce: boolean` (initial `false`) qui passe à `true` au premier unmute et masque l'overlay définitivement.
5. Overlay cliquable centré : visible si `muted && !hasUnmutedOnce && !ended`. Au clic → unmute la vidéo et masque l'overlay.
6. Toute la zone de la vidéo est cliquable pour unmute (même cible que l'overlay) — réalisé via un `<button>` plein-cadre transparent placé sous l'overlay visuel.
7. Le bouton « Couper le son / Son » bas-droit existant est conservé tel quel.
8. Le tracking de progression (`PROMO_UNLOCK_RATIO`, écriture localStorage `winelio_promo_watched`) reste strictement identique.

### Code complet à écrire

- [ ] **Step 1: Remplacer le contenu de `src/components/PromoVideo.tsx` par la nouvelle implémentation**

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VIDEO_URL = "https://pub-e56c979d6a904d1ea7337ebd66a974a5.r2.dev/winelio/promo.mp4";
export const PROMO_WATCHED_KEY = "winelio_promo_watched";
export const PROMO_UNLOCK_RATIO = 0.5;

type Props = {
  /** Notifie en continu le temps restant (en secondes) avant déblocage. 0 = déblocage atteint. */
  onCountdownChange?: (secondsLeft: number) => void;
  /** Tiré une seule fois au moment où le seuil est franchi. */
  onUnlock?: () => void;
};

export function PromoVideo({ onCountdownChange, onUnlock }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [hasUnmutedOnce, setHasUnmutedOnce] = useState(false);
  const [ended, setEnded] = useState(false);
  const unlockedRef = useRef(false);

  // Si déjà débloquée précédemment, on prévient le parent dès le mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(PROMO_WATCHED_KEY) === "1") {
      unlockedRef.current = true;
      onCountdownChange?.(0);
      onUnlock?.();
    }
  }, [onCountdownChange, onUnlock]);

  // Tracking du déblocage à PROMO_UNLOCK_RATIO du temps cumulé
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleProgress = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) return;
      const target = duration * PROMO_UNLOCK_RATIO;
      const remaining = Math.max(0, Math.ceil(target - video.currentTime));
      onCountdownChange?.(remaining);
      if (!unlockedRef.current && video.currentTime >= target) {
        unlockedRef.current = true;
        try {
          window.localStorage.setItem(PROMO_WATCHED_KEY, "1");
        } catch {}
        onUnlock?.();
      }
    };

    video.addEventListener("loadedmetadata", handleProgress);
    video.addEventListener("timeupdate", handleProgress);
    video.addEventListener("durationchange", handleProgress);
    return () => {
      video.removeEventListener("loadedmetadata", handleProgress);
      video.removeEventListener("timeupdate", handleProgress);
      video.removeEventListener("durationchange", handleProgress);
    };
  }, [onCountdownChange, onUnlock]);

  const enableSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    setHasUnmutedOnce(true);
    if (video.paused && !ended) video.play().catch(() => {});
  }, [ended]);

  const toggleSound = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (!next) setHasUnmutedOnce(true);
    if (video.paused && !ended) video.play().catch(() => {});
  }, [muted, ended]);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    video.currentTime = 0;
    video.muted = muted;
    video.play().catch(() => {});
  }, [muted]);

  const showSoundOverlay = muted && !hasUnmutedOnce && !ended;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-[0_20px_60px_rgba(255,107,53,0.18)]">
      <div className="absolute inset-0 rounded-2xl ring-1 ring-winelio-orange/20 pointer-events-none z-10" />

      <video
        ref={videoRef}
        src={VIDEO_URL}
        autoPlay
        muted
        playsInline
        className="w-full block"
        style={{ aspectRatio: "16/9" }}
        onEnded={() => {
          const video = videoRef.current;
          if (!video) return;
          video.currentTime = video.duration - 0.5;
          video.pause();
          setEnded(true);
        }}
      />

      {/* Zone cliquable plein-cadre pour activer le son au clic n'importe où sur la vidéo */}
      {showSoundOverlay && (
        <button
          type="button"
          onClick={enableSound}
          aria-label="Activer le son"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 transition hover:bg-black/30 cursor-pointer"
        >
          <span className="motion-safe:animate-pulse inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-winelio-orange to-winelio-amber px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(255,107,53,0.45)] ring-2 ring-white/40">
            <svg className="size-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
            Cliquer pour activer le son
          </span>
        </button>
      )}

      {ended && (
        <button
          onClick={replay}
          className="absolute top-3 left-3 z-30 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/80"
          aria-label="Rejouer"
        >
          <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Rejouer
        </button>
      )}

      <button
        onClick={toggleSound}
        className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/70"
        aria-label={muted ? "Activer le son" : "Couper le son"}
      >
        {muted ? (
          <>
            <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" />
            </svg>
            Son
          </>
        ) : (
          <>
            <svg className="size-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
            </svg>
            Couper le son
          </>
        )}
      </button>
    </div>
  );
}
```

### Vérifications

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: aucun warning/error sur `src/components/PromoVideo.tsx`. Si une autre ligne du repo lint en erreur (préexistant), c'est hors périmètre.

- [ ] **Step 3: Build TypeScript / Next.js**

Run: `npm run build`
Expected: build réussit sans erreur de type. Le composant doit compiler proprement (signatures `onCountdownChange`, `onUnlock`, exports `PROMO_WATCHED_KEY` / `PROMO_UNLOCK_RATIO` inchangés).

- [ ] **Step 4: Redémarrer le dev server**

Run: `pm2 restart winelio && pm2 logs winelio --lines 30 --nostream`
Expected: le serveur redémarre sans erreur, log final `✓ Ready in ...ms`.

- [ ] **Step 5: Test visuel manuel via Chrome MCP — chargement initial**

Charger `http://localhost:3002/?ref=ABCD1234` dans l'onglet Chrome courant :

```
mcp__claude-in-chrome__tabs_context_mcp(createIfEmpty: true)
mcp__claude-in-chrome__navigate(url: "http://localhost:3002/?ref=ABCD1234", tabId: <id>)
mcp__claude-in-chrome__read_console_messages(onlyErrors: true, limit: 20)
```

Attendu :
- Aucune erreur JS dans la console (notamment pas de `NotAllowedError` lié à l'autoplay).
- La vidéo joue dès le chargement (l'inviter à confirmer visuellement avec un screenshot si besoin : `mcp__claude-in-chrome__upload_image`).
- L'overlay « Cliquer pour activer le son » est visible au centre.

- [ ] **Step 6: Test visuel — clic pour activer le son**

Cliquer sur l'overlay :

```
mcp__claude-in-chrome__find(query: "Cliquer pour activer le son")
mcp__claude-in-chrome__computer(action: "click", element_id: <id du bouton>)
mcp__claude-in-chrome__read_console_messages(onlyErrors: true, limit: 10)
```

Attendu :
- Aucune erreur console.
- L'overlay disparaît.
- Le bouton bas-droit affiche désormais « Couper le son » (et non plus « Son »).

- [ ] **Step 7: Test visuel — remute via le bouton bas-droit ne réaffiche pas l'overlay**

Cliquer sur le bouton « Couper le son » bas-droit :

```
mcp__claude-in-chrome__find(query: "Couper le son")
mcp__claude-in-chrome__computer(action: "click", element_id: <id>)
```

Attendu : la vidéo passe muted, le bouton redevient « Son », mais l'overlay central NE réapparaît PAS (le state `hasUnmutedOnce` reste à `true`).

- [ ] **Step 8: Test visuel — landing sans `?ref` (régression)**

Charger `http://localhost:3002/` (sans paramètre) dans le même onglet, après avoir vidé le localStorage si besoin pour rejouer le scénario :

```
mcp__claude-in-chrome__javascript_tool(code: "localStorage.removeItem('winelio_promo_watched'); localStorage.removeItem('winelio_ref');")
mcp__claude-in-chrome__navigate(url: "http://localhost:3002/", tabId: <id>)
mcp__claude-in-chrome__read_console_messages(onlyErrors: true, limit: 10)
```

Attendu : même comportement (autoplay muted + overlay), conformément à la spec (cas B « pour tous les visiteurs »).

- [ ] **Step 9: Commit**

```bash
git add src/components/PromoVideo.tsx
git commit -m "$(cat <<'EOF'
feat(landing): autoplay vidéo promo + invitation visuelle activer le son

La vidéo de présentation démarre désormais automatiquement (muted) sur
tous les navigateurs grâce aux attributs HTML autoPlay muted playsInline.
Un overlay cliquable "Cliquer pour activer le son" apparaît au centre
tant que le visiteur n'a pas encore activé le son. Toute la zone de la
vidéo est cliquable pour unmute (pattern Instagram/TikTok). L'overlay
disparaît définitivement après le premier unmute.

L'IntersectionObserver, devenu inutile, est supprimé. Le tracking de
progression (déblocage à 50%, persistance localStorage) est inchangé.

Spec: docs/superpowers/specs/2026-05-01-promo-video-autoplay-design.md
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — Tous les éléments de la spec sont couverts :

| Spec | Task |
|------|------|
| Démarrage vidéo immédiat (`autoPlay muted playsInline`) | Step 1 (attributs sur `<video>`) |
| Suppression `IntersectionObserver` | Step 1 (effet supprimé) |
| Overlay central cliquable « Activer le son » | Step 1 (`<button>` plein-cadre + badge gradient) |
| Cible de clic = toute la vidéo | Step 1 (`absolute inset-0` sur le button) |
| Animation pulse respectant `prefers-reduced-motion` | Step 1 (`motion-safe:animate-pulse`) |
| Overlay disparaît au 1er unmute, ne réapparaît pas même si remute | Step 1 (`hasUnmutedOnce`) + Step 7 vérifie |
| Bouton son bas-droit conservé | Step 1 (bloc inchangé) |
| Tracking 50 % et persistance localStorage inchangés | Step 1 (effet `handleProgress` identique) |
| Callbacks `onCountdownChange` et `onUnlock` conservés | Step 1 (signature identique) |
| S'applique à tous les visiteurs (pas seulement `?ref`) | Step 8 vérifie |

**2. Placeholder scan** — Aucun TBD/TODO/« add error handling »/etc. Le code complet est dans Step 1.

**3. Type consistency** —
- `muted: boolean` cohérent partout
- `hasUnmutedOnce: boolean` initialisé `false`, mis à `true` dans `enableSound` ET `toggleSound` (quand on passe à unmuted)
- Props `onCountdownChange?: (s: number) => void` et `onUnlock?: () => void` strictement identiques au composant actuel
- Exports `PROMO_WATCHED_KEY` et `PROMO_UNLOCK_RATIO` strictement identiques
- Le z-index est cohérent : ring overlay z-10, sound overlay z-20, replay/sound buttons z-30 (au-dessus de l'overlay quand `ended` ou pour pouvoir toggle)

Aucun ajustement nécessaire.
