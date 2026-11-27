import Constants from "expo-constants";
import { Platform } from "react-native";

const nativeAppVersion = Constants.expoConfig?.version ?? "";

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

export const nativeBridgeScript = `
  (function () {
    if (document.documentElement) {
      document.documentElement.setAttribute("data-winelio-native", "${Platform.OS}");
    }
    if (window.__WINELIO_NATIVE_APP__) return true;
    // Filet de sécurité : même CSS que globals.css, pour que l'APK reste fluide
    // si le site n'est pas encore redéployé. Harmless si les deux sont présents.
    if ("${Platform.OS}" === "android" && document.documentElement) {
      var nativeCss = document.createElement("style");
      nativeCss.setAttribute("data-winelio-native-perf", "1");
      nativeCss.appendChild(document.createTextNode(
        'html[data-winelio-native="android"] .bz-orb{animation:none!important;filter:none!important}' +
        'html[data-winelio-native="android"] .bz-line{display:none!important}' +
        'html[data-winelio-native="android"] .animate-shimmer,html[data-winelio-native="android"] .animate-ping,html[data-winelio-native="android"] .animate-fade-up{animation:none!important}'
      ));
      (document.head || document.documentElement).appendChild(nativeCss);
    }

    // Android WebView has no Web Share API. Keep browser callers unchanged,
    // and settle their promises only after the native sheet reports its result.
    if ("${Platform.OS}" === "android" || typeof navigator.share !== "function") {
      var pendingShare = null;
      var shareSequence = 0;
      var shareError = function (name, message) {
        return new DOMException(message, name);
      };
      window.__WINELIO_NATIVE_SHARE_RESULT__ = function (id, status) {
        if (!pendingShare || pendingShare.id !== id) return;
        var request = pendingShare;
        pendingShare = null;
        if (status === "shared") request.resolve();
        else request.reject(shareError(status === "dismissed" ? "AbortError" : "NotAllowedError",
          status === "dismissed" ? "Share canceled" : "Impossible d’ouvrir le partage natif."));
      };
      Object.defineProperty(navigator, "share", { configurable: true, value: function (data) {
        return new Promise(function (resolve, reject) {
          if (pendingShare) return reject(shareError("InvalidStateError", "Un partage est déjà ouvert."));
          if (!data || (data.files && data.files.length) ||
              (typeof data.text !== "string" && typeof data.url !== "string") ||
              !(data.text || data.url)) {
            return reject(new TypeError("Le partage nécessite un texte ou un lien, sans fichier."));
          }
          var id = String(Date.now()) + "-" + String(++shareSequence);
          pendingShare = { id: id, resolve: resolve, reject: reject };
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: "share", requestId: id,
              payload: { title: data.title, text: data.text, url: data.url } }));
          } catch (_) {
            window.__WINELIO_NATIVE_SHARE_RESULT__(id, "error");
          }
        });
      }});
      Object.defineProperty(navigator, "canShare", { configurable: true, value: function (data) {
        return Boolean(data && !(data.files && data.files.length) &&
          ((typeof data.text === "string" && data.text) || (typeof data.url === "string" && data.url)));
      }});
    }

    window.addEventListener("error", function (event) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "webError",
        payload: {
          message: event.message,
          source: event.filename,
          stack: event.error && event.error.stack
        }
      }));
    });

    var originalConsoleError = console.error;
    console.error = function () {
      try {
        var details = Array.prototype.map.call(arguments, function (entry) {
          return entry && entry.stack ? entry.stack : String(entry);
        }).join("\\n");
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "webError",
          payload: { message: details }
        }));
      } catch (_) {}
      return originalConsoleError.apply(console, arguments);
    };

    window.addEventListener("unhandledrejection", function (event) {
      var reason = event.reason;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "webError",
        payload: {
          message: reason && reason.message ? reason.message : String(reason),
          stack: reason && reason.stack
        }
      }));
    });

    window.addEventListener("load", function () {
      try {
        if (!/^https?:/i.test(window.location.href)) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "pageReady",
          payload: { url: window.location.href }
        }));
      } catch (_) {}
    });
    var pendingPushRequests = {};
    var pushSequence = 0;
    window.__WINELIO_NATIVE_PUSH_RESULT__ = function (id, result) {
      var resolve = pendingPushRequests[id];
      if (!resolve) return;
      delete pendingPushRequests[id];
      resolve(result || { status: "error" });
    };
    window.__WINELIO_REQUEST_PUSH_TOKEN__ = function (prompt) {
      return new Promise(function (resolve) {
        var id = "push-" + String(Date.now()) + "-" + String(++pushSequence);
        pendingPushRequests[id] = resolve;
        window.setTimeout(function () {
          if (pendingPushRequests[id]) {
            delete pendingPushRequests[id];
            resolve({ status: "error", message: "Délai dépassé" });
          }
        }, 12000);
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "pushToken",
            requestId: id,
            payload: { prompt: Boolean(prompt) }
          }));
        } catch (_) {
          delete pendingPushRequests[id];
          resolve({ status: "unavailable" });
        }
      });
    };

    var pendingContactRequests = {};
    var contactSequence = 0;
    window.__WINELIO_NATIVE_CONTACTS_RESULT__ = function (id, result) {
      var resolve = pendingContactRequests[id];
      if (!resolve) return;
      delete pendingContactRequests[id];
      resolve(result || { status: "error" });
    };
    window.__WINELIO_PICK_CONTACT__ = function () {
      return new Promise(function (resolve) {
        var id = "contact-pick-" + String(Date.now()) + "-" + String(++contactSequence);
        pendingContactRequests[id] = resolve;
        window.setTimeout(function () {
          if (pendingContactRequests[id]) {
            delete pendingContactRequests[id];
            resolve({ status: "canceled" });
          }
        }, 120000);
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "pickContact",
            requestId: id
          }));
        } catch (_) {
          delete pendingContactRequests[id];
          resolve({ status: "unavailable" });
        }
      });
    };
    window.__WINELIO_SEARCH_CONTACTS__ = function (query) {
      return new Promise(function (resolve) {
        var q = typeof query === "string" ? query.trim().slice(0, 120) : "";
        if (q.length < 2) return resolve({ status: "ok", contacts: [] });
        var id = "contact-search-" + String(Date.now()) + "-" + String(++contactSequence);
        pendingContactRequests[id] = resolve;
        window.setTimeout(function () {
          if (pendingContactRequests[id]) {
            delete pendingContactRequests[id];
            resolve({ status: "error", message: "Délai dépassé" });
          }
        }, 20000);
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "searchContacts",
            requestId: id,
            payload: { query: q }
          }));
        } catch (_) {
          delete pendingContactRequests[id];
          resolve({ status: "unavailable" });
        }
      });
    };

    var pendingPermissionRequests = {};
    var permissionSequence = 0;
    window.__WINELIO_NATIVE_PERMISSIONS_RESULT__ = function (id, result) {
      var resolve = pendingPermissionRequests[id];
      if (!resolve) return;
      delete pendingPermissionRequests[id];
      resolve(result || { status: "error" });
    };
    window.__WINELIO_PREPARE_ASSISTANT_PERMISSIONS__ = function (options) {
      return new Promise(function (resolve) {
        var opts = options || {};
        var id = "perm-" + String(Date.now()) + "-" + String(++permissionSequence);
        pendingPermissionRequests[id] = resolve;
        window.setTimeout(function () {
          if (pendingPermissionRequests[id]) {
            delete pendingPermissionRequests[id];
            resolve({ status: "timeout", microphone: "undetermined", contacts: "undetermined", canOpenSettings: true });
          }
        }, 45000);
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "assistantPermissions",
            requestId: id,
            payload: {
              includeContacts: opts.includeContacts !== false,
              promptSettings: Boolean(opts.promptSettings)
            }
          }));
        } catch (_) {
          delete pendingPermissionRequests[id];
          resolve({ status: "unavailable", microphone: "undetermined", contacts: "undetermined", canOpenSettings: false });
        }
      });
    };
    window.__WINELIO_OPEN_APP_SETTINGS__ = function () {
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "openAppSettings" }));
      } catch (_) {}
    };

    window.__WINELIO_NATIVE_APP__ = {
      platform: "${Platform.OS}",
      version: ${JSON.stringify(nativeAppVersion)},
      capabilities: { contacts: true, microphone: true }
    };
    window.dispatchEvent(new CustomEvent("winelio:native-ready"));
    return true;
  })();
  true;
`;

export const pageHealthCheckScript = `
  (function () {
    var reportHealth = function (finalAttempt) {
      try {
        var body = document.body;
        var visibleText = body ? (body.innerText || "").replace(/\\s+/g, " ").trim() : "";
        var hasInteractiveContent = Boolean(body && body.querySelector("input, button, a, img, svg, canvas, [role='button'], [role='main']"));
        var isReady = Boolean(body && (visibleText.length >= 20 || hasInteractiveContent));
        if (isReady) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "pageReady",
            payload: { url: window.location.href }
          }));
        } else if (finalAttempt) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "pageBlank",
            payload: { url: window.location.href }
          }));
        }
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "webError",
          payload: { message: error && error.message ? error.message : "Page health check failed" }
        }));
      }
    };
    reportHealth(false);
    window.requestAnimationFrame(function () { reportHealth(false); });
    window.setTimeout(function () { reportHealth(true); }, 1500);
    return true;
  })();
  true;
`;

export const parseNativeBridgeMessage = (value: string): NativeBridgeMessage | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const message = parsed as NativeBridgeMessage;
    if (message.type === "share") {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return null;
      const payload = message.payload;
      if (!payload || typeof payload !== "object") return null;
      if ([payload.title, payload.text, payload.url].some((entry) => entry !== undefined && typeof entry !== "string")) return null;
      if (!payload.text && !payload.url) return null;
      if (payload.url && !/^https?:\/\//i.test(payload.url)) return null;
    }
    if (message.type === "pushToken" || message.type === "pickContact") {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return null;
      return message;
    }
    if (message.type === "searchContacts") {
      if (typeof message.requestId !== "string" || message.requestId.length > 100) return null;
      if (typeof message.payload?.query !== "string" || message.payload.query.length > 120) return null;
      return message;
    }
    return ["share", "pushToken", "pickContact", "searchContacts", "webError", "pageReady", "pageBlank"].includes(message.type) ? message : null;
  } catch {
    return null;
  }
};
