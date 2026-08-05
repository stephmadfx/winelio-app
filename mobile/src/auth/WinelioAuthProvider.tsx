import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { getMobileSupabase, isMobileBackendConfigured } from "@/infrastructure/supabase/mobileSupabase";

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  requestEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

type MobileSessionResponse = {
  success?: boolean;
  error?: string;
  session?: { access_token: string; refresh_token: string };
};

const AuthContext = createContext<AuthContextValue | null>(null);

const getApiUrl = () => process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "") ?? "";

const parseApiResponse = async (response: Response): Promise<MobileSessionResponse> => {
  const result = (await response.json().catch(() => ({}))) as MobileSessionResponse;
  if (!response.ok) throw new Error(result.error ?? "Une erreur est survenue.");
  return result;
};

export const WinelioAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = getMobileSupabase();

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isLoading,
    isConfigured: isMobileBackendConfigured(),
    signInWithPassword: async (email, password) => {
      if (!supabase) throw new Error("Configuration mobile Supabase manquante.");
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error("Email ou mot de passe incorrect.");
    },
    requestEmailCode: async (email) => {
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error("URL de l’API mobile manquante.");
      const response = await fetch(`${apiUrl}/api/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-winelio-client": "mobile" },
        body: JSON.stringify({ email: email.trim() }),
      });
      await parseApiResponse(response);
    },
    verifyEmailCode: async (email, code) => {
      const apiUrl = getApiUrl();
      if (!apiUrl || !supabase) throw new Error("Configuration mobile incomplète.");
      const response = await fetch(`${apiUrl}/api/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-winelio-client": "mobile" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const result = await parseApiResponse(response);
      if (!result.session) throw new Error("La session mobile n’a pas été retournée.");
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw new Error("Impossible d’ouvrir la session mobile.");
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  }), [isLoading, session, supabase]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useWinelioAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useWinelioAuth doit être utilisé dans WinelioAuthProvider.");
  return context;
};
