-- Migration : cagnotte Winelio + affiliation bonus + cashback pro
-- Ajoute le suivi des commissions plateforme dans commission_transactions

-- ── 1. Colonnes dans compensation_plans ───────────────────────────────────────
ALTER TABLE winelio.compensation_plans
  ADD COLUMN IF NOT EXISTS platform_percentage    NUMERIC NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS affiliation_percentage NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cashback_wins_percentage NUMERIC NOT NULL DEFAULT 1;

-- Mettre à jour le plan par défaut
UPDATE winelio.compensation_plans
SET platform_percentage     = 14,
    affiliation_percentage  = 1,
    cashback_wins_percentage = 1
WHERE is_default = true;

-- ── 2. Nouveau type de commission ─────────────────────────────────────────────
-- Remplacer la contrainte CHECK pour ajouter 'platform_winelio'
ALTER TABLE winelio.commission_transactions
  DROP CONSTRAINT IF EXISTS commission_transactions_type_check;

ALTER TABLE winelio.commission_transactions
  ADD CONSTRAINT commission_transactions_type_check CHECK (
    type = ANY (ARRAY[
      'recommendation'::text,
      'referral_level_1'::text,
      'referral_level_2'::text,
      'referral_level_3'::text,
      'referral_level_4'::text,
      'referral_level_5'::text,
      'affiliation_bonus'::text,
      'professional_cashback'::text,
      'manual_adjustment'::text,
      'platform_winelio'::text
    ])
  );

-- ── 3. Profil système "Winelio" ───────────────────────────────────────────────
-- UUID fixe réservé à la cagnotte plateforme
-- Ce profil ne correspond à aucun auth.users (profiles.id n'a pas de FK auth)
INSERT INTO winelio.profiles (id, email, first_name, last_name, sponsor_code)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@winelio.app',
  'Cagnotte',
  'Winelio',
  'winelio'
)
ON CONFLICT (id) DO NOTHING;

-- Wallet summary pour ce profil système (requis par la FK)
INSERT INTO winelio.user_wallet_summaries (user_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;
