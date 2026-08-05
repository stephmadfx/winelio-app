import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GradientButton } from "@/components/GradientButton";
import { WinelioTextField } from "@/components/WinelioTextField";
import { colors, radii, spacing, typography } from "@/design-system/tokens";

type BaseFormProps = {
  email: string;
  error: string;
  loading: boolean;
  setEmail: (email: string) => void;
};

const ErrorMessage = ({ message }: { message: string }) => message ? (
  <View style={styles.error}><Text style={styles.errorText}>{message}</Text></View>
) : null;

export const PasswordForm = ({
  email,
  error,
  loading,
  password,
  setEmail,
  setPassword,
  onForgotPassword,
  onSubmit,
}: BaseFormProps & {
  password: string;
  setPassword: (password: string) => void;
  onForgotPassword: () => void;
  onSubmit: () => void;
}) => {
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  return (
    <View style={styles.form}>
      <WinelioTextField
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        label="Adresse email"
        onChangeText={setEmail}
        placeholder="vous@exemple.com"
        value={email}
      />
      <WinelioTextField
        accessory={
          <Pressable accessibilityLabel={passwordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"} onPress={() => setPasswordVisible((value) => !value)}>
            <Feather color={colors.gray} name={passwordVisible ? "eye" : "eye-off"} size={20} />
          </Pressable>
        }
        autoCapitalize="none"
        autoComplete="current-password"
        label="Mot de passe"
        onChangeText={setPassword}
        onSubmitEditing={onSubmit}
        placeholder="••••••••"
        secureTextEntry={!passwordVisible}
        value={password}
      />
      <ErrorMessage message={error} />
      <GradientButton disabled={!email || !password} label="Se connecter" loading={loading} onPress={onSubmit} />
      <Pressable onPress={onForgotPassword}><Text style={styles.forgot}>Mot de passe oublié ?</Text></Pressable>
    </View>
  );
};

export const CodeRequestForm = ({ email, error, loading, setEmail, onSubmit }: BaseFormProps & { onSubmit: () => void }) => (
  <View style={styles.form}>
    <WinelioTextField
      autoCapitalize="none"
      autoComplete="email"
      keyboardType="email-address"
      label="Adresse email"
      onChangeText={setEmail}
      onSubmitEditing={onSubmit}
      placeholder="vous@exemple.com"
      value={email}
    />
    <ErrorMessage message={error} />
    <GradientButton disabled={!email} label="Recevoir le code de connexion" loading={loading} onPress={onSubmit} />
  </View>
);

export const CodeVerifyForm = ({
  code,
  email,
  error,
  loading,
  setCode,
  onBack,
  onResend,
  onSubmit,
}: {
  code: string;
  email: string;
  error: string;
  loading: boolean;
  setCode: (code: string) => void;
  onBack: () => void;
  onResend: () => void;
  onSubmit: () => void;
}) => (
  <View style={styles.form}>
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Vérifiez votre email</Text>
      <Text style={styles.noticeText}>Un code à 6 chiffres a été envoyé à <Text style={styles.email}>{email}</Text>.</Text>
      <Text style={styles.hint}>La réception peut prendre quelques minutes. Pensez à vérifier vos spams.</Text>
    </View>
    <WinelioTextField
      autoFocus
      keyboardType="number-pad"
      label="Code à 6 chiffres"
      maxLength={6}
      onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
      onSubmitEditing={onSubmit}
      placeholder="123456"
      style={styles.code}
      value={code}
    />
    <ErrorMessage message={error} />
    <GradientButton disabled={code.length !== 6} label="Se connecter" loading={loading} onPress={onSubmit} />
    <View style={styles.secondaryActions}>
      <Pressable onPress={onBack} style={styles.secondaryButton}><Text style={styles.secondaryText}>Autre adresse</Text></Pressable>
      <Pressable onPress={onResend} style={styles.secondaryButton}><Text style={styles.secondaryText}>Renvoyer le code</Text></Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  form: { gap: spacing[5], marginTop: spacing[6] },
  error: { backgroundColor: colors.dangerSoft, borderColor: "#FECACA", borderRadius: radii.lg, borderWidth: 1, padding: spacing[3] },
  errorText: { color: colors.danger, fontFamily: typography.regular, fontSize: 13, textAlign: "center" },
  forgot: { color: colors.orange, fontFamily: typography.medium, fontSize: 13, textAlign: "right" },
  notice: { backgroundColor: "rgba(248,249,250,0.8)", borderColor: "#F3F4F6", borderRadius: radii.lg, borderWidth: 1, padding: spacing[4] },
  noticeTitle: { color: colors.dark, fontFamily: typography.medium, fontSize: 14 },
  noticeText: { color: colors.gray, fontFamily: typography.regular, fontSize: 13, lineHeight: 21, marginTop: spacing[2] },
  email: { color: colors.orange, fontFamily: typography.semibold },
  hint: { color: "rgba(99,110,114,0.8)", fontFamily: typography.regular, fontSize: 11, lineHeight: 17, marginTop: spacing[2] },
  code: { fontFamily: typography.semibold, fontSize: 24, letterSpacing: 9, textAlign: "center" },
  secondaryActions: { flexDirection: "row", gap: spacing[3] },
  secondaryButton: { alignItems: "center", backgroundColor: "rgba(248,249,250,0.75)", borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flex: 1, padding: spacing[3] },
  secondaryText: { color: colors.gray, fontFamily: typography.medium, fontSize: 12 },
});
