import type { ContactFormData } from "./types";

export type ImportedPhoneContact = {
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

type NativePickResponse =
  | { status: "selected"; contact: ImportedPhoneContact }
  | { status: "canceled" | "denied" | "unavailable" }
  | { status: "error"; message?: string };

type NativeSearchResponse =
  | { status: "ok"; contacts: ImportedPhoneContact[] }
  | { status: "denied" | "unavailable" }
  | { status: "error"; message?: string };

type WebContactAddress = {
  addressLine?: string[];
  city?: string;
  dependentLocality?: string;
  postalCode?: string;
};

type WebContactEntry = {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: WebContactAddress[];
};

export type NativeAssistantPermissionsResponse = {
  status: string;
  microphone: "granted" | "denied" | "undetermined";
  contacts: "granted" | "denied" | "undetermined";
  canOpenSettings?: boolean;
};

declare global {
  interface Window {
    __WINELIO_PICK_CONTACT__?: () => Promise<NativePickResponse>;
    __WINELIO_SEARCH_CONTACTS__?: (query: string) => Promise<NativeSearchResponse>;
    __WINELIO_PREPARE_ASSISTANT_PERMISSIONS__?: (options?: {
      includeContacts?: boolean;
      promptSettings?: boolean;
    }) => Promise<NativeAssistantPermissionsResponse>;
    __WINELIO_OPEN_APP_SETTINGS__?: () => void;
  }
  interface Navigator {
    contacts?: {
      select: (
        properties: Array<"name" | "email" | "tel" | "address">,
        options?: { multiple?: boolean },
      ) => Promise<WebContactEntry[]>;
      getProperties?: () => Promise<string[]>;
    };
  }
}

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

export function splitPhoneAndCountryCode(rawPhone: string): { country_code: string; phone: string } {
  const cleaned = rawPhone.replace(/[^\d+]/g, "");
  if (!cleaned) return { country_code: "+33", phone: "" };

  const intl = cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned;
  if (intl.startsWith("+")) {
    for (const code of KNOWN_DIAL_CODES) {
      if (intl.startsWith(code)) {
        return { country_code: code, phone: intl.slice(code.length).replace(/^0+/, "") };
      }
    }
    return { country_code: "+33", phone: intl.replace(/^\+\d{1,3}/, "").replace(/^0+/, "") };
  }

  const digits = intl.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return { country_code: "+33", phone: digits.slice(1) };
  }
  return { country_code: "+33", phone: digits };
}

function decodeQuotedPrintableUtf8(input: string): string {
  const softJoined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < softJoined.length; i++) {
    if (softJoined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(softJoined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(softJoined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const encoded = new TextEncoder().encode(softJoined[i]);
      for (const b of encoded) bytes.push(b);
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
}

function unescapeVcardValue(val: string): string {
  return val
    .replace(/\\n/gi, ", ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

export function parseVcardText(rawVcard: string): ImportedPhoneContact | null {
  if (!rawVcard || !/BEGIN:VCARD/i.test(rawVcard)) return null;

  // Dépliage RFC 6350 (lignes repliées commençant par espace ou tabulation)
  const unfolded = rawVcard.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  let firstName = "";
  let lastName = "";
  let fullName = "";
  let email = "";
  let rawPhone = "";
  let street = "";
  let city = "";
  let postalCode = "";

  for (const line of lines) {
    if (/^END:VCARD/i.test(line)) break;
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;

    const rawKey = line.slice(0, colonIdx);
    let rawVal = line.slice(colonIdx + 1);
    const isQuotedPrintable = /ENCODING=QUOTED-PRINTABLE/i.test(rawKey);
    if (isQuotedPrintable) {
      rawVal = decodeQuotedPrintableUtf8(rawVal);
    }

    const prop = (rawKey.split(";")[0]?.split(".").pop() ?? "").toUpperCase();

    if (prop === "N" && !firstName && !lastName) {
      const parts = rawVal.split(";").map(unescapeVcardValue);
      lastName = parts[0] ?? "";
      firstName = parts[1] ?? "";
    } else if (prop === "FN" && !fullName) {
      fullName = unescapeVcardValue(rawVal);
    } else if (prop === "EMAIL" && !email) {
      email = unescapeVcardValue(rawVal).toLowerCase();
    } else if (prop === "TEL" && !rawPhone) {
      rawPhone = unescapeVcardValue(rawVal);
    } else if (prop === "ADR" && !street && !city && !postalCode) {
      const parts = rawVal.split(";").map(unescapeVcardValue);
      // ADR: PO Box ; Extended ; Street ; Locality (City) ; Region ; PostalCode ; Country
      street = [parts[2], parts[1]].filter(Boolean).join(", ");
      city = parts[3] ?? "";
      postalCode = (parts[5] ?? "").replace(/\s+/g, "");
    }
  }

  if (!firstName && !lastName && fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  if (!firstName && !lastName && !email && !rawPhone) return null;
  const { country_code, phone } = splitPhoneAndCountryCode(rawPhone);

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: fullName || `${firstName} ${lastName}`.trim(),
    email,
    phone,
    country_code,
    address: street,
    city,
    postal_code: postalCode,
  };
}

export function getContactImportMode(): "native" | "web-picker" | "vcard" {
  if (typeof window !== "undefined" && typeof window.__WINELIO_PICK_CONTACT__ === "function") {
    return "native";
  }
  if (
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    typeof navigator.contacts?.select === "function"
  ) {
    return "web-picker";
  }
  return "vcard";
}

export function canSearchDeviceContacts(): boolean {
  return typeof window !== "undefined" && typeof window.__WINELIO_SEARCH_CONTACTS__ === "function";
}

export async function enrichContactMunicipality(
  contact: ImportedPhoneContact,
): Promise<ImportedPhoneContact> {
  const zip = contact.postal_code.trim();
  const city = contact.city.trim();
  if ((zip && city) || (!zip && !city)) return contact;

  try {
    if (/^\d{5}$/.test(zip) && !city) {
      const res = await fetch(
        `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(zip)}&fields=nom&limit=1`,
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ nom?: string }>;
        if (rows[0]?.nom) return { ...contact, city: rows[0].nom };
      }
    } else if (city.length >= 2 && !zip) {
      const res = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&fields=codesPostaux&boost=population&limit=1`,
      );
      if (res.ok) {
        const rows = (await res.json()) as Array<{ codesPostaux?: string[] }>;
        const code = rows[0]?.codesPostaux?.[0];
        if (code) return { ...contact, postal_code: code };
      }
    }
  } catch {
    // Silencieux hors-ligne
  }
  return contact;
}

export function mergePhoneContactIntoForm(
  current: ContactFormData,
  picked: ImportedPhoneContact,
): ContactFormData {
  return {
    first_name: picked.first_name || current.first_name,
    last_name: picked.last_name || current.last_name,
    email: picked.email || current.email,
    phone: picked.phone || current.phone,
    country_code: picked.phone ? picked.country_code : current.country_code,
    address: picked.address || current.address,
    city: picked.city || current.city,
    postal_code: picked.postal_code || current.postal_code,
  };
}

export async function pickPhoneContactInteractive(): Promise<
  | { status: "selected"; contact: ImportedPhoneContact }
  | { status: "needs-vcard" }
  | { status: "canceled" }
  | { status: "denied" }
  | { status: "error"; message: string }
> {
  // 1. Pont natif iOS / Android (Winelio Mobile 1.0.6+)
  if (typeof window !== "undefined" && typeof window.__WINELIO_PICK_CONTACT__ === "function") {
    const res = await window.__WINELIO_PICK_CONTACT__();
    if (res.status === "selected") {
      return { status: "selected", contact: await enrichContactMunicipality(res.contact) };
    }
    if (res.status === "canceled") return { status: "canceled" };
    if (res.status === "denied") return { status: "denied" };
    if (res.status === "unavailable") return { status: "needs-vcard" };
    return {
      status: "error",
      message: (res.status === "error" ? res.message : undefined) || "Impossible d'ouvrir le répertoire.",
    };
  }

  // 2. Contact Picker API standard (Chrome / Samsung / Edge sur Android)
  if (
    typeof navigator !== "undefined" &&
    "contacts" in navigator &&
    typeof navigator.contacts?.select === "function"
  ) {
    try {
      const supported = navigator.contacts.getProperties
        ? await navigator.contacts.getProperties()
        : ["name", "email", "tel", "address"];
      const props = (["name", "email", "tel", "address"] as const).filter((p) =>
        supported.includes(p),
      );
      const selected = await navigator.contacts.select(
        props.length > 0 ? props : ["name", "tel", "email"],
        { multiple: false },
      );
      const entry = selected?.[0];
      if (!entry) return { status: "canceled" };

      const fullName = (entry.name?.[0] ?? "").trim();
      const parts = fullName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ");
      const email = (entry.email?.[0] ?? "").trim().toLowerCase();
      const { country_code, phone } = splitPhoneAndCountryCode(entry.tel?.[0] ?? "");
      const addr = entry.address?.[0];
      const street = (addr?.addressLine ?? []).filter(Boolean).join(", ").trim();
      const city = (addr?.city || addr?.dependentLocality || "").trim();
      const postalCode = (addr?.postalCode ?? "").replace(/\s+/g, "").trim();

      const contact = await enrichContactMunicipality({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        email,
        phone,
        country_code,
        address: street,
        city,
        postal_code: postalCode,
      });
      return { status: "selected", contact };
    } catch {
      return { status: "canceled" };
    }
  }

  // 3. Safari iOS / Navigateur Desktop -> déclenche le sélecteur de fiche .vcf
  return { status: "needs-vcard" };
}

export async function searchDeviceContactsByName(
  query: string,
): Promise<ImportedPhoneContact[]> {
  if (!canSearchDeviceContacts()) return [];
  const res = await window.__WINELIO_SEARCH_CONTACTS__!(query);
  if (res.status !== "ok" || !Array.isArray(res.contacts)) return [];
  return res.contacts;
}

export function canOpenWinelioAppSettings(): boolean {
  return typeof window !== "undefined" && typeof window.__WINELIO_OPEN_APP_SETTINGS__ === "function";
}

export function openWinelioAppSettings(): void {
  if (canOpenWinelioAppSettings()) {
    window.__WINELIO_OPEN_APP_SETTINGS__!();
  }
}

export async function prepareAssistantNativePermissions(options?: {
  includeContacts?: boolean;
  promptSettings?: boolean;
}): Promise<NativeAssistantPermissionsResponse | null> {
  if (
    typeof window === "undefined" ||
    typeof window.__WINELIO_PREPARE_ASSISTANT_PERMISSIONS__ !== "function"
  ) {
    return null;
  }
  try {
    return await window.__WINELIO_PREPARE_ASSISTANT_PERMISSIONS__(options);
  } catch {
    return null;
  }
}
