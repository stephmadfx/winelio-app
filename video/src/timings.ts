// ── Durées des slides en frames (30 fps = 1 seconde) ────────────────────────
// Ce fichier est géré par l'éditeur visuel video/editor/
// Modifie les valeurs ici ou via http://localhost:3001

export const SLIDE_DURATIONS = [
  { id: "slide1", label: "Accroche",  frames: 130 },
  { id: "slide2", label: "Problème",  frames: 221 },
  { id: "slide3", label: "Solution",  frames: 254 },
  { id: "slide4", label: "Réseau",  frames: 218 },
  { id: "slide5", label: "CTA final",  frames: 210 },
] as const;

export type SlideId = (typeof SLIDE_DURATIONS)[number]["id"];

// Calcul automatique des offsets (départ de chaque slide)
export const SLIDE_OFFSETS = SLIDE_DURATIONS.reduce<Record<string, number>>(
  (acc, slide, i) => {
    acc[slide.id] = i === 0 ? 0 : acc[SLIDE_DURATIONS[i - 1].id] + SLIDE_DURATIONS[i - 1].frames;
    return acc;
  },
  {}
);

export const TOTAL_FRAMES = SLIDE_DURATIONS.reduce((sum, s) => sum + s.frames, 0);
export const FPS = 30;
