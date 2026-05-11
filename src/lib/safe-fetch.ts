/**
 * Wrapper léger autour de `fetch` qui ne plante jamais sur un parse JSON
 * (cas typique : 504 du proxy qui renvoie de l'HTML, ou réponse vide).
 *
 * Retourne un objet discriminé { ok, status, data, error } qui couvre :
 *   - erreur réseau (DNS, offline, CORS) → ok: false, status: 0
 *   - réponse non-JSON (HTML d'erreur du proxy) → ok: false, data: null
 *   - HTTP non-2xx → ok: false, data peut contenir { error, reason } si JSON
 *   - succès → ok: true, data typé
 *
 * Évite les unhandled `SyntaxError: The string did not match the expected pattern.`
 * remontés à Sentry quand le frontend appelle `res.json()` sans garde.
 */
export type SafeJsonResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: unknown; error: string };

export async function safeJsonFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<SafeJsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Connexion impossible. Vérifie ta connexion et réessaie.",
    };
  }

  let data: unknown = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const fallback =
      res.status >= 500 || res.status === 408
        ? "Le serveur n'a pas répondu. Réessaie dans un instant."
        : "Erreur. Réessaie.";
    const apiError =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;
    return { ok: false, status: res.status, data, error: apiError || fallback };
  }

  return { ok: true, status: res.status, data: data as T };
}
