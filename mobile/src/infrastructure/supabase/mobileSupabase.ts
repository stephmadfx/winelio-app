import "react-native-url-polyfill/auto";

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

const webStorage = {
  getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage?.removeItem(key),
};

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const createMobileClient = (url: string, anonKey: string) => createClient(url, anonKey, {
  db: { schema: "winelio" },
  auth: {
    storage: Platform.OS === "web" ? webStorage : nativeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

type MobileSupabaseClient = ReturnType<typeof createMobileClient>;

let mobileSupabase: MobileSupabaseClient | null | undefined;

export const isMobileBackendConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

export const getMobileSupabase = (): MobileSupabaseClient | null => {
  if (mobileSupabase !== undefined) return mobileSupabase;
  if (!supabaseUrl || !supabaseAnonKey) {
    mobileSupabase = null;
    return mobileSupabase;
  }

  mobileSupabase = createMobileClient(supabaseUrl, supabaseAnonKey);

  return mobileSupabase;
};
