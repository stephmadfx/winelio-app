// Client-safe continuation, deliberately restricted to the claim destination.
export const claimPath = (value: unknown): string | null =>
  typeof value === "string" && /^\/claim\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
