export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  // Linking conserve l'invitation originale ; la WebView gère son parcours d'inscription.
  return /^winelio:\/\/invite(?:[/?]|$)/i.test(path) ? "/" : path;
}
