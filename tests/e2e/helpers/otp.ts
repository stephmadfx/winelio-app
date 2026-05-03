import { wn } from "./supabase";

/**
 * Lit le code OTP fraîchement émis pour un email donné.
 * Polling court car la route /api/auth/send-code insère dans winelio.otp_codes
 * juste avant de répondre au front.
 */
export async function readOtpCode(email: string, timeoutMs = 5_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await wn()
      .from("otp_codes")
      .select("code, expires_at")
      .eq("email", email.toLowerCase())
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error) throw error;
    if (data?.code) return data.code;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`[E2E] OTP introuvable pour ${email} (timeout ${timeoutMs}ms)`);
}
