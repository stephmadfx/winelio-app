import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import { colors } from "@/design-system/tokens";
import { WebAppError, WebAppLoading } from "@/features/webapp/WebAppFeedback";
import { nativeBridgeScript, pageHealthCheckScript, parseNativeBridgeMessage } from "@/features/webapp/nativeBridge";
import {
  LOAD_TIMEOUT_MS,
  isHttpDocumentUrl,
  shouldArmLoadTimeout,
  shouldCoverWithLoadingOverlay,
  shouldFailOnHealthBlank,
  shouldFailOnHttpError,
  shouldFailOnTimeout,
  shouldUnmountWebViewOnFailure,
} from "@/features/webapp/webAppLoadPolicy";
import { isExternalProtocol, shouldLoadInWebView, webAppEntryUrl } from "@/features/webapp/webAppNavigation";

export const WinelioWebAppScreen = () => {
  const webView = useRef<WebView>(null);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPaintDone = useRef(false);
  const timeoutPausedInBackground = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [webViewKey, setWebViewKey] = useState(0);

  const clearLoadTimeout = useCallback(() => {
    if (!loadTimeout.current) return;
    clearTimeout(loadTimeout.current);
    loadTimeout.current = null;
  }, []);

  const markContentVisible = useCallback(() => {
    firstPaintDone.current = true;
    timeoutPausedInBackground.current = false;
    clearLoadTimeout();
    setFailed(false);
    setLoaded(true);
  }, [clearLoadTimeout]);

  const showFailure = useCallback((message: string, kind: "timeout" | "http" | "blank" | "net" | "crash") => {
    if (!shouldUnmountWebViewOnFailure(firstPaintDone.current, kind)) return;
    firstPaintDone.current = false;
    clearLoadTimeout();
    setLoaded(false);
    setFailed(true);
    setFailureMessage(message);
  }, [clearLoadTimeout]);

  const armLoadTimeout = useCallback(() => {
    clearLoadTimeout();
    if (!shouldArmLoadTimeout(firstPaintDone.current)) return;
    loadTimeout.current = setTimeout(() => {
      if (!shouldFailOnTimeout(firstPaintDone.current)) return;
      showFailure("Le chargement a pris trop de temps. Vérifiez votre connexion puis réessayez.", "timeout");
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout, showFailure]);

  const beginLoading = useCallback(() => {
    setFailed(false);
    setFailureMessage(undefined);
    if (shouldCoverWithLoadingOverlay(firstPaintDone.current)) {
      setLoaded(false);
      setProgress(0);
    }
    armLoadTimeout();
  }, [armLoadTimeout]);

  useEffect(() => clearLoadTimeout, [clearLoadTimeout]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        if (loadTimeout.current) {
          clearLoadTimeout();
          timeoutPausedInBackground.current = true;
        }
        return;
      }
      if (timeoutPausedInBackground.current && !firstPaintDone.current && !failed) {
        timeoutPausedInBackground.current = false;
        armLoadTimeout();
      }
    });
    return () => subscription.remove();
  }, [armLoadTimeout, clearLoadTimeout, failed]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const openOutsideApp = useCallback((url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  }, []);

  const retry = () => {
    firstPaintDone.current = false;
    timeoutPausedInBackground.current = false;
    beginLoading();
    setWebViewKey((current) => current + 1);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseNativeBridgeMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "pageReady") {
      if (!isHttpDocumentUrl(message.payload?.url)) return;
      markContentVisible();
      return;
    }
    if (message.type === "pageBlank") {
      if (shouldFailOnHealthBlank(firstPaintDone.current)) {
        showFailure("Cette page n’a pas pu s’afficher correctement. Réessayez pour la recharger.", "blank");
      }
    }
  };

  if (Platform.OS === "web") {
    return (
      <View style={styles.webFallback}>
        <iframe src={webAppEntryUrl} style={{ border: 0, height: "100%", width: "100%" }} title="Winelio" />
      </View>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea} testID="webapp-root">
      {failed ? <WebAppError message={failureMessage} onRetry={retry} /> : (
        <View style={styles.container}>
          <WebView
            key={webViewKey}
            ref={webView}
            applicationNameForUserAgent={`WinelioNative/${Platform.OS}`}
            allowsBackForwardNavigationGestures
            allowsInlineMediaPlayback
            androidLayerType="hardware"
            cacheEnabled
            domStorageEnabled
            geolocationEnabled
            overScrollMode="never"
            javaScriptCanOpenWindowsAutomatically
            javaScriptEnabled
            injectedJavaScriptBeforeContentLoaded={nativeBridgeScript}
            onContentProcessDidTerminate={() => showFailure("La page a été interrompue par le système. Touchez Réessayer pour la relancer.", "crash")}
            onError={() => showFailure("Impossible de charger Winelio. Vérifiez votre connexion puis réessayez.", "net")}
            onHttpError={(event) => {
              if (shouldFailOnHttpError(event.nativeEvent.statusCode, firstPaintDone.current)) {
                showFailure(`Le serveur Winelio a répondu avec une erreur (${event.nativeEvent.statusCode}). Réessayez dans un instant.`, "http");
              }
            }}
            onLoadEnd={(event) => {
              if (!isHttpDocumentUrl(event.nativeEvent.url)) return;
              markContentVisible();
              webView.current?.injectJavaScript(pageHealthCheckScript);
            }}
            onLoadProgress={(event) => {
              const next = event.nativeEvent.progress;
              setProgress(next);
              if (next >= 1 && isHttpDocumentUrl(event.nativeEvent.url)) {
                markContentVisible();
              }
            }}
            onLoadStart={beginLoading}
            onMessage={handleMessage}
            onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
            onRenderProcessGone={() => showFailure("La page ne répondait plus et a été arrêtée. Touchez Réessayer pour la relancer.", "crash")}
            onShouldStartLoadWithRequest={(request) => {
              if (shouldLoadInWebView(request.url, request.isTopFrame)) return true;
              if (isExternalProtocol(request.url) || /^https?:/i.test(request.url)) {
                openOutsideApp(request.url);
              }
              return false;
            }}
            originWhitelist={["https://*", "http://*", "about:*", "blob:*", "data:*"]}
            pullToRefreshEnabled
            setSupportMultipleWindows={false}
            sharedCookiesEnabled
            source={{ uri: webAppEntryUrl }}
            startInLoadingState={false}
            style={styles.webView}
            thirdPartyCookiesEnabled
            webviewDebuggingEnabled={__DEV__}
          />
          {!loaded ? <WebAppLoading progress={progress} /> : null}
          {loaded ? <View style={styles.testMarker} testID="auth-loaded" /> : null}
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.light, flex: 1 },
  container: { flex: 1 },
  webView: { backgroundColor: colors.light, flex: 1 },
  webFallback: { flex: 1 },
  testMarker: { height: 1, opacity: 0.01, position: "absolute", right: 0, top: 0, width: 1 },
});
