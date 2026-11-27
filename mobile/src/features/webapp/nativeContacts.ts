import { Platform } from "react-native";

export type NormalizedDeviceContact = {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  country_code: string;
  address: string;
  city: string;
  postal_code: string;
};

export type NativeContactPickResult =
  | { status: "selected"; contact: NormalizedDeviceContact }
  | { status: "canceled" | "denied" | "unavailable" }
  | { status: "error"; message: string };

export type NativeContactSearchResult =
  | { status: "ok"; contacts: NormalizedDeviceContact[] }
  | { status: "denied" | "unavailable" }
  | { status: "error"; message: string };

const KNOWN_DIAL_CODES = [
  "+352",
  "+377",
  "+351",
  "+212",
  "+216",
  "+213",
  "+225",
  "+221",
  "+237",
  "+33",
  "+32",
  "+41",
  "+44",
  "+49",
  "+39",
  "+34",
  "+31",
  "+1",
];

function stripAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function splitPhoneAndCountry(rawPhone: string): { country_code: string; phone: string } {
  const cleaned = rawPhone.replace(/[^\d+]/g, "");
  if (!cleaned) return { country_code: "+33", phone: "" };

  const intl = cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned;
  if (intl.startsWith("+")) {
    for (const code of KNOWN_DIAL_CODES) {
      if (intl.startsWith(code)) {
        const local = intl.slice(code.length).replace(/^0+/, "");
        return { country_code: code, phone: local };
      }
    }
    return { country_code: "+33", phone: intl.replace(/^\+\d{1,3}/, "").replace(/^0+/, "") };
  }

  // Numéro local français / belge (ex. 0612345678 -> 612345678 avec +33)
  const digits = intl.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return { country_code: "+33", phone: digits.slice(1) };
  }
  return { country_code: "+33", phone: digits };
}

async function loadContactsModule() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    return await import("expo-contacts");
  } catch {
    return null;
  }
}

function normalizeExpoContact(raw: {
  firstName?: string;
  lastName?: string;
  name?: string;
  emails?: Array<{ email?: string; isPrimary?: boolean }>;
  phoneNumbers?: Array<{ number?: string; digits?: string; isPrimary?: boolean }>;
  addresses?: Array<{ street?: string; city?: string; postalCode?: string }>;
}): NormalizedDeviceContact {
  let firstName = (raw.firstName ?? "").trim();
  let lastName = (raw.lastName ?? "").trim();
  const fullName = (raw.name ?? `${firstName} ${lastName}`).trim();

  if (!firstName && !lastName && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  const primaryEmail =
    raw.emails?.find((e) => e.isPrimary && e.email)?.email ??
    raw.emails?.find((e) => e.email)?.email ??
    "";

  const primaryPhoneObj =
    raw.phoneNumbers?.find((p) => p.isPrimary && (p.number || p.digits)) ??
    raw.phoneNumbers?.find((p) => p.number || p.digits);
  const { country_code, phone } = splitPhoneAndCountry(
    primaryPhoneObj?.number || primaryPhoneObj?.digits || "",
  );

  const addr =
    raw.addresses?.find((a) => a.street || a.city || a.postalCode) ?? raw.addresses?.[0];

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName || `${firstName} ${lastName}`.trim(),
    email: primaryEmail.trim().toLowerCase(),
    phone,
    country_code,
    address: (addr?.street ?? "").replace(/\s*\n\s*/g, ", ").trim(),
    city: (addr?.city ?? "").trim(),
    postal_code: (addr?.postalCode ?? "").replace(/\s+/g, "").trim(),
  };
}

export async function pickNativeContact(): Promise<NativeContactPickResult> {
  const Contacts = await loadContactsModule();
  if (!Contacts) return { status: "unavailable" };

  try {
    // Sur Android, READ_CONTACTS est requis avant presentContactPickerAsync ; sur iOS aucune permission préalable n'est exigée.
    if (Platform.OS === "android") {
      const existing = await Contacts.getPermissionsAsync();
      let granted = existing.granted;
      if (!granted) {
        const req = await Contacts.requestPermissionsAsync();
        granted = req.granted;
      }
      if (!granted) return { status: "denied" };
    }

    const picked = await Contacts.presentContactPickerAsync();
    if (!picked) return { status: "canceled" };

    return {
      status: "selected",
      contact: normalizeExpoContact(picked),
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Impossible d'ouvrir le répertoire.",
    };
  }
}

export async function searchNativeContacts(rawQuery: string): Promise<NativeContactSearchResult> {
  const query = stripAccents(rawQuery);
  if (query.length < 2) return { status: "ok", contacts: [] };

  const Contacts = await loadContactsModule();
  if (!Contacts) return { status: "unavailable" };

  try {
    const existing = await Contacts.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      const req = await Contacts.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return { status: "denied" };

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.FirstName,
        Contacts.Fields.LastName,
        Contacts.Fields.Name,
        Contacts.Fields.Emails,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Addresses,
      ],
    });

    const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return { status: "ok", contacts: [] };

    const scored: Array<{ score: number; contact: NormalizedDeviceContact }> = [];
    for (const item of data) {
      const normalized = normalizeExpoContact(item);
      const haystack = stripAccents(
        `${normalized.first_name} ${normalized.last_name} ${normalized.full_name}`,
      );
      if (!haystack) continue;

      const matchedCount = tokens.filter((t) => haystack.includes(t)).length;
      if (matchedCount === 0) continue;

      let score = matchedCount * 10;
      if (haystack === query) score += 50;
      else if (haystack.startsWith(query)) score += 25;
      if (normalized.phone) score += 3;
      if (normalized.email) score += 3;

      // Si plusieurs mots ont été donnés (prénom + nom), exiger au moins tous les mots ou une correspondance forte
      if (tokens.length >= 2 && matchedCount < tokens.length) continue;

      scored.push({ score, contact: normalized });
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      status: "ok",
      contacts: scored.slice(0, 5).map((s) => s.contact),
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Erreur de recherche dans le répertoire.",
    };
  }
}

export function nativeContactsResultScript(
  requestId: string,
  result: NativeContactPickResult | NativeContactSearchResult,
): string {
  return `window.__WINELIO_NATIVE_CONTACTS_RESULT__ && window.__WINELIO_NATIVE_CONTACTS_RESULT__(${JSON.stringify(
    requestId,
  )}, ${JSON.stringify(result)}); true;`;
}
