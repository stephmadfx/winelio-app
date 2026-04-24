// Génère une fausse date de dernière connexion déterministe à partir d'un ID.
// Plage : entre 1 jour et 6 mois. Stable entre rendus (pas d'aléatoire).
export function fakeLastActive(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash * 31 + id.charCodeAt(i), 1) & 0x7fffffff;
  }
  const daysAgo = 1 + (hash % 179);
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return minutes <= 1 ? "À l'instant" : `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(months / 12)} an${Math.floor(months / 12) > 1 ? "s" : ""}`;
}
