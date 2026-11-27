export type NativeBridgeMessage = {
  requestId?: string;
  type:
    | "share"
    | "pushToken"
    | "pickContact"
    | "searchContacts"
    | "assistantPermissions"
    | "openAppSettings"
    | "webError"
    | "pageReady"
    | "pageBlank";
  payload?: {
    message?: string;
    source?: string;
    stack?: string;
    title?: string;
    text?: string;
    url?: string;
    prompt?: boolean;
    query?: string;
    includeContacts?: boolean;
    promptSettings?: boolean;
  };
};

const ALLOWED_TYPES = new Set<NativeBridgeMessage["type"]>([
  "share",
  "pushToken",
  "pickContact",
  "searchContacts",
  "assistantPermissions",
  "openAppSettings",
  "webError",
  "pageReady",
  "pageBlank",
]);

export const parseNativeBridgeMessage = (value: string): NativeBridgeMessage | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const message = parsed as NativeBridgeMessage;
    if (!ALLOWED_TYPES.has(message.type)) return null;

    if (message.type === "share") {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return null;
      const payload = message.payload;
      if (!payload || typeof payload !== "object") return null;
      if (
        [payload.title, payload.text, payload.url].some(
          (entry) => entry !== undefined && typeof entry !== "string",
        )
      ) {
        return null;
      }
      if (!payload.text && !payload.url) return null;
      if (payload.url && !/^https?:\/\//i.test(payload.url)) return null;
    }
    if (
      message.type === "pushToken" ||
      message.type === "pickContact" ||
      message.type === "assistantPermissions"
    ) {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return null;
      return message;
    }
    if (message.type === "searchContacts") {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return null;
      if (typeof message.payload?.query !== "string" || message.payload.query.length > 120) {
        return null;
      }
      return message;
    }
    return message;
  } catch {
    return null;
  }
};
