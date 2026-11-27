import * as Linking from "expo-linking";
import { requireOptionalNativeModule } from "expo";
import { Alert, PermissionsAndroid, Platform } from "react-native";

type WinelioNativeMicModule = {
  getMicrophonePermissionStatus?: () => Promise<"granted" | "denied" | "undetermined">;
  requestMicrophonePermission?: () => Promise<"granted" | "denied">;
};

export type PermissionState = "granted" | "denied" | "undetermined";

export type AssistantPermissionsResult = {
  status: "ok";
  microphone: PermissionState;
  contacts: PermissionState;
  canOpenSettings: boolean;
  blockedInSettings?: boolean;
};

const nativeMicModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<WinelioNativeMicModule>("WinelioReferral")
    : null;

let permissionRunInFlight: Promise<AssistantPermissionsResult> | null = null;

export function openNativeAppSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

export function promptContactsSettingsAlert(): void {
  Alert.alert(
    "Autoriser l’accès au répertoire",
    "Pour importer ou retrouver automatiquement les coordonnées d’un proche, activez les Contacts dans les réglages de Winelio.",
    [
      { text: "Annuler", style: "cancel" },
      { text: "Ouvrir les Réglages", onPress: openNativeAppSettings },
    ],
  );
}

function promptMicAndContactsSettingsAlert(contactsDenied: boolean): void {
  Alert.alert(
    contactsDenied ? "Autoriser le micro et le répertoire" : "Autoriser l’accès au microphone",
    contactsDenied
      ? "Pour parler à l’assistant vocal et retrouver automatiquement vos contacts, activez le Microphone et les Contacts dans les réglages de Winelio."
      : "Pour parler à l’assistant vocal Winelio, activez l’accès au Microphone dans les réglages de l’application.",
    [
      { text: "Annuler", style: "cancel" },
      { text: "Ouvrir les Réglages", onPress: openNativeAppSettings },
    ],
  );
}

async function resolveIosMicrophonePermission(): Promise<{
  state: PermissionState;
  blockedInSettings: boolean;
}> {
  if (Platform.OS === "ios") {
    try {
      const current = (await nativeMicModule?.getMicrophonePermissionStatus?.()) ?? "undetermined";
      if (current === "granted") {
        return { state: "granted", blockedInSettings: false };
      }
      if (current === "undetermined" && nativeMicModule?.requestMicrophonePermission) {
        const next = await nativeMicModule.requestMicrophonePermission();
        return { state: next, blockedInSettings: false };
      }
      return { state: "denied", blockedInSettings: true };
    } catch {
      return { state: "undetermined", blockedInSettings: false };
    }
  }

  return { state: "undetermined", blockedInSettings: false };
}

async function resolveContactsPermission(shouldRequest: boolean): Promise<PermissionState> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "undetermined";
  try {
    const Contacts = await import("expo-contacts");
    const existing = await Contacts.getPermissionsAsync();
    if (existing.granted) return "granted";
    if (shouldRequest && existing.canAskAgain !== false) {
      const requested = await Contacts.requestPermissionsAsync();
      return requested.granted ? "granted" : "denied";
    }
    return existing.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

async function ensureAndroidAssistantPermissions(options: {
  includeContacts: boolean;
  promptSettings: boolean;
}): Promise<AssistantPermissionsResult> {
  const micPerm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  const contactsPerm = PermissionsAndroid.PERMISSIONS.READ_CONTACTS;

  try {
    const micAlready = await PermissionsAndroid.check(micPerm);
    const contactsAlready = options.includeContacts
      ? await PermissionsAndroid.check(contactsPerm)
      : false;

    const toRequest: Array<typeof micPerm | typeof contactsPerm> = [];
    if (!micAlready) toRequest.push(micPerm);
    if (options.includeContacts && !contactsAlready) toRequest.push(contactsPerm);

    if (toRequest.length === 0) {
      let contactsState: PermissionState = contactsAlready ? "granted" : "undetermined";
      if (!options.includeContacts) {
        contactsState = (await PermissionsAndroid.check(contactsPerm)) ? "granted" : "undetermined";
      }
      return {
        status: "ok",
        microphone: "granted",
        contacts: contactsState,
        canOpenSettings: true,
        blockedInSettings: false,
      };
    }

    // Un seul appel Activity.requestPermissions groupé évite l'écrasement de mPermissionListener sur Android
    const results = await PermissionsAndroid.requestMultiple(toRequest);
    const micResult = micAlready
      ? PermissionsAndroid.RESULTS.GRANTED
      : results[micPerm];
    const contactsResult = contactsAlready
      ? PermissionsAndroid.RESULTS.GRANTED
      : options.includeContacts
        ? results[contactsPerm]
        : undefined;

    const micState: PermissionState =
      micResult === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
    const contactsState: PermissionState =
      contactsResult === PermissionsAndroid.RESULTS.GRANTED
        ? "granted"
        : contactsResult
          ? "denied"
          : "undetermined";
    const micBlockedInSettings = micResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

    if (options.promptSettings && micState !== "granted" && micBlockedInSettings) {
      promptMicAndContactsSettingsAlert(contactsState === "denied");
    }

    return {
      status: "ok",
      microphone: micState,
      contacts: contactsState,
      canOpenSettings: true,
      blockedInSettings: micBlockedInSettings,
    };
  } catch {
    return {
      status: "ok",
      microphone: "denied",
      contacts: "undetermined",
      canOpenSettings: true,
      blockedInSettings: false,
    };
  }
}

export async function ensureAssistantPermissions(options: {
  includeContacts?: boolean;
  promptSettings?: boolean;
}): Promise<AssistantPermissionsResult> {
  if (permissionRunInFlight) return permissionRunInFlight;

  const run = (async (): Promise<AssistantPermissionsResult> => {
    const includeContacts = options.includeContacts !== false;
    if (Platform.OS === "android") {
      return ensureAndroidAssistantPermissions({
        includeContacts,
        promptSettings: Boolean(options.promptSettings),
      });
    }

    const mic = await resolveIosMicrophonePermission();
    const contacts = await resolveContactsPermission(includeContacts);

    if (options.promptSettings && mic.state !== "granted" && mic.blockedInSettings) {
      promptMicAndContactsSettingsAlert(contacts === "denied");
    }

    return {
      status: "ok",
      microphone: mic.state,
      contacts,
      canOpenSettings: Platform.OS === "ios",
      blockedInSettings: mic.blockedInSettings,
    };
  })();

  permissionRunInFlight = run.finally(() => {
    permissionRunInFlight = null;
  });
  return permissionRunInFlight;
}

export function nativePermissionsResultScript(
  requestId: string,
  result: AssistantPermissionsResult,
): string {
  return `window.__WINELIO_NATIVE_PERMISSIONS_RESULT__ && window.__WINELIO_NATIVE_PERMISSIONS_RESULT__(${JSON.stringify(
    requestId,
  )}, ${JSON.stringify(result)}); true;`;
}
