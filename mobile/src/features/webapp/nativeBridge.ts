import { Platform } from "react-native";

export type NativeBridgeMessage = {
  requestId?: string;
  type: "share" | "webError" | "pageReady" | "pageBlank";
  payload?: {
    message?: string;
    source?: string;
    stack?: string;
    title?: string;
    text?: string;
    url?: string;
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
    window.__WINELIO_NATIVE_APP__ = { platform: "${Platform.OS}" };
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
    return ["share", "webError", "pageReady", "pageBlank"].includes(message.type) ? message : null;
  } catch {
    return null;
  }
};
