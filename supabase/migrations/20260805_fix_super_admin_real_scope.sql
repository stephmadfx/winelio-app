-- Corrige la source de vérité des écrans Super Admin :
-- - exclusion explicite des données de démonstration ;
-- - création idempotente du profil système de la cagnotte ;
-- - conservation des commissions plateforme réelles dans commissions_real.

CREATE OR REPLACE FUNCTION winelio.is_real_member(
  profile_id uuid,
  profile_email text,
  profile_is_demo boolean
)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT profile_id <> '00000000-0000-0000-0000-000000000001'::uuid
    AND NOT COALESCE(profile_is_demo, false)
    AND NOT winelio.is_e2e_email(profile_email)
$$;

INSERT INTO winelio.profiles (
  id,
  email,
  first_name,
  last_name,
  sponsor_code,
  is_active,
  is_demo
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@winelio.app',
  'Cagnotte',
  'Winelio',
  'winelio',
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  is_active = true,
  is_demo = false;

INSERT INTO winelio.user_wallet_summaries (user_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE VIEW winelio.profiles_real AS
SELECT p.*
FROM winelio.profiles p
WHERE winelio.is_real_member(p.id, p.email, p.is_demo);

CREATE OR REPLACE VIEW winelio.recommendations_real AS
SELECT r.*
FROM winelio.recommendations r
JOIN winelio.profiles referrer ON referrer.id = r.referrer_id
WHERE winelio.is_real_member(referrer.id, referrer.email, referrer.is_demo)
  AND NOT COALESCE(r.is_demo, false);

CREATE OR REPLACE VIEW winelio.commissions_real AS
SELECT c.*
FROM winelio.commission_transactions c
JOIN winelio.profiles beneficiary ON beneficiary.id = c.user_id
WHERE NOT COALESCE(c.is_demo, false)
  AND (
    c.type = 'platform_winelio'
    OR winelio.is_real_member(beneficiary.id, beneficiary.email, beneficiary.is_demo)
  );

CREATE OR REPLACE VIEW winelio.withdrawals_real AS
SELECT w.*
FROM winelio.withdrawals w
JOIN winelio.profiles p ON p.id = w.user_id
WHERE winelio.is_real_member(p.id, p.email, p.is_demo);

CREATE OR REPLACE VIEW winelio.wallet_summaries_real AS
WITH real_commissions AS (
  SELECT
    c.user_id,
    COALESCE(sum(c.amount) FILTER (
      WHERE c.status = 'EARNED' AND c.type <> 'professional_cashback'
    ), 0) AS total_earned,
    COALESCE(sum(c.amount) FILTER (
      WHERE c.status = 'PENDING' AND c.type <> 'professional_cashback'
    ), 0) AS pending_commissions,
    COALESCE(sum(c.amount) FILTER (
      WHERE c.status = 'EARNED' AND c.type = 'professional_cashback'
    ), 0) AS total_wins
  FROM winelio.commissions_real c
  WHERE c.type <> 'platform_winelio'
  GROUP BY c.user_id
), real_withdrawals AS (
  SELECT
    w.user_id,
    COALESCE(sum(w.amount) FILTER (WHERE w.status IN ('PROCESSING', 'COMPLETED')), 0) AS total_withdrawn
  FROM winelio.withdrawals_real w
  GROUP BY w.user_id
)
SELECT
  s.id,
  p.id AS user_id,
  COALESCE(c.total_earned, 0) AS total_earned,
  COALESCE(w.total_withdrawn, 0) AS total_withdrawn,
  COALESCE(c.pending_commissions, 0) AS pending_commissions,
  GREATEST(COALESCE(c.total_earned, 0) - COALESCE(w.total_withdrawn, 0), 0) AS available,
  COALESCE(c.total_wins, 0) AS total_wins,
  GREATEST(COALESCE(c.total_wins, 0) - COALESCE(s.redeemed_wins, 0), 0) AS available_wins,
  COALESCE(s.redeemed_wins, 0) AS redeemed_wins,
  s.created_at,
  s.updated_at
FROM winelio.profiles p
JOIN winelio.user_wallet_summaries s ON s.user_id = p.id
LEFT JOIN real_commissions c ON c.user_id = p.id
LEFT JOIN real_withdrawals w ON w.user_id = p.id
WHERE winelio.is_real_member(p.id, p.email, p.is_demo);

CREATE OR REPLACE VIEW winelio.companies_real AS
SELECT c.*
FROM winelio.companies c
JOIN winelio.profiles p ON p.id = c.owner_id
WHERE winelio.is_real_member(p.id, p.email, p.is_demo)
  AND c.source = 'owner'
  AND c.deleted_at IS NULL;

GRANT EXECUTE ON FUNCTION winelio.is_real_member(uuid, text, boolean) TO service_role;
GRANT SELECT ON winelio.profiles_real TO service_role;
GRANT SELECT ON winelio.recommendations_real TO service_role;
GRANT SELECT ON winelio.commissions_real TO service_role;
GRANT SELECT ON winelio.withdrawals_real TO service_role;
GRANT SELECT ON winelio.wallet_summaries_real TO service_role;
GRANT SELECT ON winelio.companies_real TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM winelio.profiles_real WHERE COALESCE(is_demo, false)) THEN
    RAISE EXCEPTION 'profiles_real contient encore des profils de démonstration';
  END IF;

  IF EXISTS (SELECT 1 FROM winelio.recommendations_real WHERE COALESCE(is_demo, false)) THEN
    RAISE EXCEPTION 'recommendations_real contient encore des recommandations de démonstration';
  END IF;

  IF EXISTS (SELECT 1 FROM winelio.commissions_real WHERE COALESCE(is_demo, false)) THEN
    RAISE EXCEPTION 'commissions_real contient encore des commissions de démonstration';
  END IF;
END $$;
