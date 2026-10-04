// Only the links embedded in delivered emails are public. The studio, send APIs
// and campaign reports continue to require an authenticated administrator.
export function isPublicNewsletterPath(path: string): boolean {
  return /^\/api\/newsletter\/(?:track\/(?:open|click)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|unsubscribe\/[0-9a-f]{48})$/i.test(path);
}
