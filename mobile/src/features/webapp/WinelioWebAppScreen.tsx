import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";

import { colors } from "@/design-system/tokens";
import { WebAppError, WebAppLoading } from "@/features/webapp/WebAppFeedback";
import { nativeBridgeScript, pageHealthCheckScript, parseNativeBridgeMessage } from "@/features/webapp/nativeBridge";
import { isEmbeddedNavigation, isExternalProtocol, webAppEntryUrl } from "@/features/webapp/webAppNavigation";

const LOAD_TIMEOUT_MS = 20_000;

export const WinelioWebAppScreen = () => {
  const webView = useRef<WebView>(null);
  const loadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const showFailure = useCallback((message: string) => {
    clearLoadTimeout();
    setLoaded(false);
    setFailed(true);
    setFailureMessage(message);
  }, [clearLoadTimeout]);

  const beginLoading = useCallback(() => {
    clearLoadTimeout();
    setFailed(false);
    setFailureMessage(undefined);
    setLoaded(false);
    setProgress(0);
    loadTimeout.current = setTimeout(() => {
      showFailure("Le chargement a pris trop de temps. Vérifiez votre connexion puis réessayez.");
    }, LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout, showFailure]);

  useEffect(() => clearLoadTimeout, [clearLoadTimeout]);

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
    beginLoading();
    setWebViewKey((current) => current + 1);
  };

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseNativeBridgeMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "pageReady") {
      clearLoadTimeout();
      setLoaded(true);
      return;
    }
    if (message.type === "pageBlank") {
      showFailure("Cette page n’a pas pu s’afficher correctement. Réessayez pour la recharger.");
      return;
    }
    // Les erreurs JavaScript sont remontées par le bridge pour le diagnostic,
    // mais seule l'absence réelle de contenu déclenche l'écran de secours.
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
            cacheEnabled
            domStorageEnabled
            geolocationEnabled
            javaScriptCanOpenWindowsAutomatically
            javaScriptEnabled
            injectedJavaScriptBeforeContentLoaded={nativeBridgeScript}
            onContentProcessDidTerminate={() => showFailure("La page a été interrompue par le système. Touchez Réessayer pour la relancer.")}
            onError={() => showFailure("Impossible de charger Winelio. Vérifiez votre connexion puis réessayez.")}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 400) {
                showFailure(`Le serveur Winelio a répondu avec une erreur (${event.nativeEvent.statusCode}). Réessayez dans un instant.`);
              }
            }}
            onLoadEnd={() => webView.current?.injectJavaScript(pageHealthCheckScript)}
            onLoadProgress={(event) => setProgress(event.nativeEvent.progress)}
            onLoadStart={beginLoading}
            onMessage={handleMessage}
            onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
            onRenderProcessGone={() => showFailure("La page ne répondait plus et a été arrêtée. Touchez Réessayer pour la relancer.")}
            onShouldStartLoadWithRequest={(request) => {
              if (isEmbeddedNavigation(request.url)) return true;
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
