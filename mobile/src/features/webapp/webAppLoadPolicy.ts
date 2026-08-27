/**
 * Politique de chargement WebView : l'overlay et l'écran d'erreur
 * ne doivent jamais masquer une page déjà affichée, ni réagir
 * à un body temporairement vide (nav RSC / middleware).
 */

export const LOAD_TIMEOUT_MS = 20_000;

export function shouldCoverWithLoadingOverlay(firstPaintDone: boolean) {
  return !firstPaintDone;
}

export function shouldArmLoadTimeout(firstPaintDone: boolean) {
  return !firstPaintDone;
}

export function shouldFailOnHealthBlank(_firstPaintDone: boolean) {
  return false;
}

export function shouldFailOnHttpError(statusCode: number, firstPaintDone: boolean) {
  if (firstPaintDone) return false;
  return statusCode >= 500;
}

export function shouldFailOnTimeout(firstPaintDone: boolean) {
  return !firstPaintDone;
}

export function shouldUnmountWebViewOnFailure(
  firstPaintDone: boolean,
  kind: "timeout" | "http" | "blank" | "net" | "crash",
) {
  if (kind === "blank" || kind === "http") return false;
  if (kind === "timeout") return !firstPaintDone;
  return kind === "net" || kind === "crash";
}

export function isHttpDocumentUrl(url?: string | null) {
  return Boolean(url && /^https?:/i.test(url));
}
