import { E2E } from "./env";

async function trigger(path: string, method: "GET" | "POST" = "POST") {
  const res = await fetch(`${E2E.baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${E2E.cronSecret}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`cron ${path}: HTTP ${res.status} ${body}`);
  }
  return res.json().catch(() => ({}));
}

export const cron = {
  scrapedReminder: () => trigger("/api/recommendations/cron-scraped-reminder", "GET"),
  processFollowups: () => trigger("/api/recommendations/process-followups", "POST"),
  processQueue: () => trigger("/api/email/process-queue", "POST"),
};
