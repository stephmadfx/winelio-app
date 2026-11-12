import { isWebAppEntryPath } from "@/features/webapp/webAppNavigation";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  // Linking conserve le lien original ; la WebView gère l'invitation et charge la page demandée.
  return isWebAppEntryPath(path) ? "/" : path;
}
