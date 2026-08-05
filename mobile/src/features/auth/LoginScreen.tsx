import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useWinelioAuth } from "@/auth/WinelioAuthProvider";
import { AuthMethodSwitch, type AuthMethod } from "@/components/AuthMethodSwitch";
import { WinelioBackground } from "@/components/WinelioBackground";
import { WinelioLogo } from "@/components/WinelioLogo";
import { colors, radii, shadows, spacing, textStyles, typography } from "@/design-system/tokens";
import { CodeRequestForm, CodeVerifyForm, PasswordForm } from "@/features/auth/AuthForms";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LoginScreen = () => {
  const router = useRouter();
  const { requestEmailCode, signInWithPassword, verifyEmailCode } = useWinelioAuth();
  const [method, setMethod] = useState<AuthMethod>("password");
  const [codeStep, setCodeStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const runAuthAction = async (action: () => Promise<void>, navigate = false) => {
    setError("");
    setLoading(true);
    try {
      await action();
      if (navigate) router.replace("/(tabs)");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = () => {
    if (emailPattern.test(email.trim())) return true;
    setError("Veuillez saisir une adresse email valide.");
    return false;
  };

  const handlePasswordLogin = () => {
    if (!validateEmail()) return;
    void runAuthAction(() => signInWithPassword(email, password), true);
  };

  const handleRequestCode = () => {
    if (!validateEmail()) return;
    void runAuthAction(async () => {
      await requestEmailCode(email);
      setCodeStep("verify");
    });
  };

  const handleVerifyCode = () => {
    if (code.length !== 6) return;
    void runAuthAction(() => verifyEmailCode(email, code), true);
  };

  const changeMethod = (nextMethod: AuthMethod) => {
    setMethod(nextMethod);
    setCodeStep("email");
    setCode("");
    setError("");
  };

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ?? "https://winelio.app";
  const title = method === "password" ? "Se connecter" : codeStep === "email" ? "Recevoir un code" : "Vérifier le code";
  const subtitle = method === "password"
    ? "Connectez-vous avec votre email et votre mot de passe."
    : codeStep === "email"
      ? "Entrez votre adresse email, nous vous envoyons un code de connexion à 6 chiffres."
      : "Saisissez le code reçu par email pour ouvrir votre dashboard.";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
      <WinelioBackground />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <WinelioLogo width={156} />
          <View style={styles.card}>
            <LinearGradient colors={[colors.orange, colors.amber, colors.orange]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.accent} />
            <AuthMethodSwitch value={method} onChange={changeMethod} />
            <View style={styles.intro}>
              <View style={styles.introCopy}>
                <Text style={textStyles.eyebrow}>{method === "password" ? "Connexion" : codeStep === "email" ? "Étape 1 sur 2" : "Étape 2 sur 2"}</Text>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>
              <View style={styles.introIcon}>
                <Feather color={colors.orange} name={method === "password" ? "lock" : "mail"} size={24} strokeWidth={1.8} />
              </View>
            </View>

            {method === "password" ? (
              <PasswordForm
                email={email}
                error={error}
                loading={loading}
                password={password}
                setEmail={setEmail}
                setPassword={setPassword}
                onForgotPassword={() => void Linking.openURL(`${apiUrl}/auth/forgot-password`)}
                onSubmit={handlePasswordLogin}
              />
            ) : codeStep === "email" ? (
              <CodeRequestForm email={email} error={error} loading={loading} setEmail={setEmail} onSubmit={handleRequestCode} />
            ) : (
              <CodeVerifyForm
                code={code}
                email={email}
                error={error}
                loading={loading}
                setCode={setCode}
                onBack={() => { setCodeStep("email"); setCode(""); setError(""); }}
                onResend={handleRequestCode}
                onSubmit={handleVerifyCode}
              />
            )}
          </View>
          {codeStep === "email" ? (
            <Pressable onPress={() => void Linking.openURL(`${apiUrl}/auth/login?mode=register`)}>
              <Text style={styles.register}>Pas de compte ? Créer un compte</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.light, flex: 1 },
  keyboardView: { flex: 1 },
  content: { flexGrow: 1, gap: spacing[8], justifyContent: "center", paddingHorizontal: spacing[4], paddingVertical: spacing[8] },
  card: { backgroundColor: colors.white, borderColor: "rgba(0,0,0,0.05)", borderRadius: radii.card, borderWidth: 1, padding: spacing[6], ...shadows.card },
  accent: { borderRadius: radii.pill, height: 6, marginBottom: spacing[5] },
  intro: { alignItems: "flex-start", flexDirection: "row", gap: spacing[4], justifyContent: "space-between", marginTop: spacing[5] },
  introCopy: { flex: 1 },
  title: { color: colors.dark, fontFamily: typography.semibold, fontSize: 24, lineHeight: 30, marginTop: spacing[2] },
  subtitle: { color: colors.gray, fontFamily: typography.regular, fontSize: 14, lineHeight: 23, marginTop: spacing[2] },
  introIcon: { alignItems: "center", backgroundColor: colors.orangeSoft, borderRadius: radii.lg, height: 48, justifyContent: "center", width: 48 },
  register: { color: colors.gray, fontFamily: typography.medium, fontSize: 14, textAlign: "center" },
});
