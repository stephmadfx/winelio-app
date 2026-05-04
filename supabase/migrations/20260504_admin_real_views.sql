-- ============================================================
-- Vues "real" pour les KPI super_admin
-- ============================================================
-- Filtrent les comptes de test E2E (@winelio-e2e.local) sans
-- toucher aux tables d'origine. Les pages /gestion-reseau/
-- pointent vers ces vues à la place de la table directement.
--
-- Choix : on filtre par user_id (pas par recommendation_id ou
-- contact_id). Les commissions platform_winelio générées par les
-- tests E2E ne sont pas filtrées, mais elles vont sur le compte
-- système (UUID 00000000-0000-0000-0000-000000000001), donc
-- isolées du reste des KPI utilisateurs.

-- ── Helper IMMUTABLE pour la lisibilité ──────────────────────
CREATE OR REPLACE FUNCTION winelio.is_e2e_email(addr text)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT addr ILIKE '%@winelio-e2e.local'
$$;

-- ── 1. profiles_real : profils non-E2E ───────────────────────
CREATE OR REPLACE VIEW winelio.profiles_real AS
  SELECT *
    FROM winelio.profiles
   WHERE NOT winelio.is_e2e_email(email);

-- ── 2. recommendations_real : recos dont le referrer n'est pas E2E
CREATE OR REPLACE VIEW winelio.recommendations_real AS
  SELECT r.*
    FROM winelio.recommendations r
    JOIN winelio.profiles p ON p.id = r.referrer_id
   WHERE NOT winelio.is_e2e_email(p.email);

-- ── 3. commissions_real : commissions des users non-E2E ─────
-- Exception : platform_winelio est conservé tel quel (compte système),
-- mais les KPI super admin filtrent souvent platform_winelio à part de
-- toute façon.
CREATE OR REPLACE VIEW winelio.commissions_real AS
  SELECT c.*
    FROM winelio.commission_transactions c
    JOIN winelio.profiles p ON p.id = c.user_id
   WHERE NOT winelio.is_e2e_email(p.email);

-- ── 4. withdrawals_real ─────────────────────────────────────
CREATE OR REPLACE VIEW winelio.withdrawals_real AS
  SELECT w.*
    FROM winelio.withdrawals w
    JOIN winelio.profiles p ON p.id = w.user_id
   WHERE NOT winelio.is_e2e_email(p.email);

-- ── 5. wallet_summaries_real ────────────────────────────────
CREATE OR REPLACE VIEW winelio.wallet_summaries_real AS
  SELECT s.*
    FROM winelio.user_wallet_summaries s
    JOIN winelio.profiles p ON p.id = s.user_id
   WHERE NOT winelio.is_e2e_email(p.email);

-- ── 6. companies_real ───────────────────────────────────────
CREATE OR REPLACE VIEW winelio.companies_real AS
  SELECT c.*
    FROM winelio.companies c
    JOIN winelio.profiles p ON p.id = c.owner_id
   WHERE NOT winelio.is_e2e_email(p.email);

-- ── Permissions : service_role peut lire (déjà actif via bypass RLS,
--    mais on grant explicit pour les autres rôles si besoin)
GRANT SELECT ON winelio.profiles_real          TO service_role;
GRANT SELECT ON winelio.recommendations_real   TO service_role;
GRANT SELECT ON winelio.commissions_real       TO service_role;
GRANT SELECT ON winelio.withdrawals_real       TO service_role;
GRANT SELECT ON winelio.wallet_summaries_real  TO service_role;
GRANT SELECT ON winelio.companies_real         TO service_role;

-- ── Sanity check : combien de comptes E2E filtrés ? ──────────
DO $$
DECLARE
  e2e_count int;
BEGIN
  SELECT count(*) INTO e2e_count
    FROM winelio.profiles WHERE winelio.is_e2e_email(email);
  RAISE NOTICE 'Comptes E2E à exclure des KPI admin : %', e2e_count;
END $$;
