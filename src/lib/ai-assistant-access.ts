const DEFAULT_ALLOWED_EMAILS = [
  "contact@aide-multimedia.fr",
  "thierry.carlier.pro@gmail.com",
];

const DEFAULT_ALLOWED_USER_IDS = new Set([
  "73dddec2-6f36-4b88-a3be-36730e134665", // Stéphane Mairiaux
  "5265c489-8052-440a-8dc4-5a23341849e9", // Thierry Carlier
]);

export function isAiAssistantAllowed(
  user: { id?: string | null; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  const rawEnv = process.env.AI_ASSISTANT_ALLOWED_EMAILS?.trim();
  if (rawEnv === "*") return true;

  const allowedEmails = (rawEnv ? rawEnv.split(",") : DEFAULT_ALLOWED_EMAILS)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = (user.email ?? "").trim().toLowerCase();
  if (email && allowedEmails.includes(email)) return true;
  if (!rawEnv && user.id && DEFAULT_ALLOWED_USER_IDS.has(user.id)) return true;
  return false;
}
