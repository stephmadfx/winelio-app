import { Platform } from "react-native";

export type NativeBridgeMessage = {
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
    if (window.__WINELIO_NATIVE_APP__) return true;
    window.__WINELIO_NATIVE_APP__ = { platform: "${Platform.OS}" };
    if (document.documentElement) {
      document.documentElement.setAttribute("data-winelio-native", "${Platform.OS}");
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
        }).join("\n");
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
        if (isReady || finalAttempt) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: isReady ? "pageReady" : "pageBlank",
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
    window.requestAnimationFrame(function () {
      window.setTimeout(function () { reportHealth(false); }, 500);
    });
    window.setTimeout(function () { reportHealth(true); }, 3000);
    return true;
  })();
  true;
`;

export const parseNativeBridgeMessage = (value: string): NativeBridgeMessage | null => {
  try {
    const message = JSON.parse(value) as NativeBridgeMessage;
    return ["share", "webError", "pageReady", "pageBlank"].includes(message.type) ? message : null;
  } catch {
    return null;
  }
};
