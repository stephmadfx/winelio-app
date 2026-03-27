-- Migration: Création de la table otp_codes
-- À exécuter via: node -e "..." (voir README) ou via Coolify Terminal → supabase-db

CREATE TABLE IF NOT EXISTS public.otp_codes (
  email      TEXT         PRIMARY KEY,
  code       TEXT         NOT NULL,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- Sécurité : RLS activé, seul le service_role peut accéder
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Nettoyage automatique des codes expirés (optionnel, à activer si pg_cron installé)
-- SELECT cron.schedule('cleanup-otp', '0 * * * *', 'DELETE FROM public.otp_codes WHERE expires_at < NOW()');
