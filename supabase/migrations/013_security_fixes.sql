-- Migration 013: Corrections sécurité
-- 1. OTP brute-force : compteur de tentatives + TTL court
-- 2. Solde wallet : contrainte positive

-- ── OTP : colonne attempts ──────────────────────────────────────────────────
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- ── Wallet : empêcher les soldes négatifs en DB ─────────────────────────────
ALTER TABLE winelio.user_wallet_summaries
  DROP CONSTRAINT IF EXISTS chk_available_positive;

ALTER TABLE winelio.user_wallet_summaries
  ADD CONSTRAINT chk_available_positive CHECK (available >= 0);
