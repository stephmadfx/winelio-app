import { requireOptionalNativeModule } from "expo";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform } from "react-native";
import { parseInstallReferrer, parseReferralLink, referralClipboardLink, referralRegistrationPath, type ReferralInvite } from "../../../../src/lib/referral-install";
import { webAppEntryUrl, webAppOrigin } from "./webAppNavigation";

type ReferralModule = {
  getItem(key: string): string | null;
  setItem(key: string, value: string | null): void;
  getInstallReferrer(): Promise<string | null>;
  hasClipboardLink(): Promise<boolean>;
  readClipboardLink(): Promise<string | null>;
};
const native = Platform.OS === "web" ? null : requireOptionalNativeModule<ReferralModule>("WinelioReferral");

export function useReferralEntry() {
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);

  const accept = (next: ReferralInvite) => {
    if (!mounted.current) return;
    revision.current++;
    native?.setItem("pending", JSON.stringify({ link: referralClipboardLink(next), savedAt: Date.now() }));
    native?.setItem("checked", "1");
    setEntryUrl(webAppOrigin + referralRegistrationPath(next));
  };

  const pasteInvitation = async () => {
    if (!native || Platform.OS !== "ios" || AppState.currentState !== "active") return;
    const requestRevision = revision.current;
    try {
      const value = await native.readClipboardLink();
      if (!mounted.current || revision.current !== requestRevision) return;
      const next = value ? parseReferralLink(value) : null;
      if (next) accept(next);
      else Alert.alert("Invitation introuvable", "Autorisez le collage ou revenez sur votre invitation et touchez « Ouvrir mon invitation ». Vous pouvez aussi saisir le code dans le formulaire.");
    } catch {
      Alert.alert("Collage indisponible", "Réessayez depuis le bouton « Coller mon invitation ».");
    }
  };

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const startRevision = revision.current;
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const next = parseReferralLink(url);
      if (next) accept(next);
    });
    const bootstrap = async () => {
      try {
        const initial = await Linking.getInitialURL();
        if (!active || revision.current !== startRevision) return;
        const direct = initial ? parseReferralLink(initial) : null;
        if (direct) { accept(direct); return; }
        const pending = native?.getItem("pending");
        if (pending) {
          try {
            const saved = JSON.parse(pending);
            const next = typeof saved.link === "string" ? parseReferralLink(saved.link) : null;
            if (next && Number.isFinite(saved.savedAt) && Date.now() - saved.savedAt >= 0
              && Date.now() - saved.savedAt < 7 * 86400000) { accept(next); return; }
          } catch { /* Une ancienne invitation illisible ne bloque pas le démarrage. */ }
          native?.setItem("pending", null);
        }
        if (Platform.OS === "android" && native && !native.getItem("checked")) {
          const value = await native.getInstallReferrer();
          if (!active || revision.current !== startRevision) return;
          const next = value ? parseInstallReferrer(value) : null;
          if (next) accept(next);
          native.setItem("checked", "1");
        }
        if (active && revision.current === startRevision) setEntryUrl(webAppEntryUrl);
        if (Platform.OS === "ios" && native && !native.getItem("checked")) {
          const hasLink = await native.hasClipboardLink();
          if (!active || revision.current !== startRevision) return;
          native.setItem("checked", "1");
          if (hasLink && AppState.currentState === "active") Alert.alert(
            "Retrouver votre parrain",
            "Si vous venez d’installer Winelio depuis une invitation, autorisez le collage de son lien.",
            [{ text: "Plus tard", style: "cancel" }, { text: "Coller mon invitation", onPress: () => { void pasteInvitation(); } }],
          );
        }
      } catch {
        // Une panne de Google Play reste réessayable au prochain lancement.
        if (active && revision.current === startRevision) setEntryUrl(webAppEntryUrl);
      }
    };
    void bootstrap();
    return () => { active = false; mounted.current = false; subscription.remove(); };
    // L'abonnement doit conserver sa durée de vie, indépendamment des navigations WebView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNavigation = (value: string) => {
    try {
      const url = new URL(value);
      if (url.origin === webAppOrigin && url.pathname === "/dashboard") {
        native?.setItem("pending", null);
      }
    } catch { /* Les URL internes WebView ne sont pas toutes HTTP. */ }
  };

  return { entryUrl, pasteInvitation, onNavigation, canPaste: Boolean(native) && Platform.OS === "ios" };
}
