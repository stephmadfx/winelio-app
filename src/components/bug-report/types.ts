export interface BugReport {
  id: string;
  message: string;
  page_url: string;
  status: string;
  admin_reply: string | null;
  reply_images: string[] | null;
  created_at: string;
}

export interface PendingReply {
  id: string;
  reply: string;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
