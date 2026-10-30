export function isActivityPath(pathname: string): boolean {
  return pathname === "/activity" || pathname.startsWith("/activity/");
}
export function isMemberNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/dashboard" && isActivityPath(pathname));
}
