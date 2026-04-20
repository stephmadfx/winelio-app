function parseDateInput(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isAtLeastAge(dateStr: string, minAge = 18): boolean {
  const birth = parseDateInput(dateStr);
  if (!birth) return false;

  const now = new Date();
  const limit = new Date(Date.UTC(now.getUTCFullYear() - minAge, now.getUTCMonth(), now.getUTCDate()));
  return birth <= limit;
}

export function maxBirthDate(minAge = 18): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - minAge, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
