import { Platform } from "react-native";
import { resolveNotificationTargetUrl } from "./webAppNavigation";

export type NativePushTokenResult = {
  status: "granted" | "denied" | "unavailable" | "error";
  platform?: "ios" | "android";
  token?: string;
  message?: string;
};

let handlerInitialized = false;

async function loadNotificationsModule() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    const Notifications = await import("expo-notifications");
    if (!handlerInitialized) {
      handlerInitialized = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("winelio-default", {
          name: "Notifications Winelio",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 200, 120, 200],
          lightColor: "#FF6B35",
          sound: "default",
        }).catch(() => undefined);
      }
    }
    return Notifications;
  } catch {
    // Le binaire natif installé ne contient pas encore le module Push (avant mise à jour store)
    return null;
  }
}

export async function requestNativePushToken(prompt: boolean): Promise<NativePushTokenResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { status: "unavailable" };
  }
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return {
      status: "unavailable",
      platform: Platform.OS,
      message: "Module de notifications natif non embarqué dans cette version de l'application.",
    };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted =
      existing.granted ||
      existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted && prompt) {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      granted =
        requested.granted ||
        requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    if (!granted) {
      return { status: "denied", platform: Platform.OS };
    }

    const deviceToken = await Notifications.getDevicePushTokenAsync();
    const rawToken = typeof deviceToken?.data === "string" ? deviceToken.data.trim() : "";
    if (!rawToken) {
      return {
        status: "error",
        platform: Platform.OS,
        message: "Jeton de notification indisponible sur cet appareil.",
      };
    }

    return {
      status: "granted",
      platform: Platform.OS,
      token: rawToken,
    };
  } catch (err) {
    return {
      status: "error",
      platform: Platform.OS,
      message: err instanceof Error ? err.message : "Erreur d'activation des notifications.",
    };
  }
}

export function nativePushResultScript(requestId: string, result: NativePushTokenResult): string {
  return `window.__WINELIO_NATIVE_PUSH_RESULT__ && window.__WINELIO_NATIVE_PUSH_RESULT__(${JSON.stringify(
    requestId,
  )}, ${JSON.stringify(result)}); true;`;
}

export function subscribePushNotificationClicks(
  onNavigate: (targetUrl: string) => void,
): () => void {
  let active = true;
  let removeSub: (() => void) | null = null;

  void loadNotificationsModule().then(async (Notifications) => {
    if (!active || !Notifications) return;

    try {
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const coldUrl = resolveNotificationTargetUrl(
        lastResponse?.notification?.request?.content?.data?.url,
      );
      if (active && coldUrl) {
        onNavigate(coldUrl);
      }
    } catch {
      /* ignore */
    }

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const targetUrl = resolveNotificationTargetUrl(
        response?.notification?.request?.content?.data?.url,
      );
      if (targetUrl) {
        onNavigate(targetUrl);
      }
    });
    removeSub = () => sub.remove();
  });

  return () => {
    active = false;
    removeSub?.();
  };
}
