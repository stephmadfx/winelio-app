-- ============================================================
-- Lockdown des policies RLS sur les 3 tables financières
-- ============================================================
-- Faille détectée le 2026-05-04 : un user authentifié pouvait
-- modifier son propre wallet via une requête Supabase directe
-- (UPDATE winelio.user_wallet_summaries SET total_earned = ...).
-- Une fois le solde gonflé, l'API /api/wallet/withdraw acceptait
-- le retrait car elle relit user_wallet_summaries.available comme
-- source de vérité.
--
-- Principe corrigé : aucune écriture financière côté user. Toutes
-- les mutations passent par supabaseAdmin (bypass RLS) ou par des
-- triggers SECURITY DEFINER. Le client a uniquement le droit de
-- LIRE ses propres données.

-- ── 1. user_wallet_summaries ─────────────────────────────────
DROP POLICY IF EXISTS wallet_select  ON winelio.user_wallet_summaries;
DROP POLICY IF EXISTS wallet_insert  ON winelio.user_wallet_summaries;
DROP POLICY IF EXISTS wallet_update  ON winelio.user_wallet_summaries;
DROP POLICY IF EXISTS wallet_delete  ON winelio.user_wallet_summaries;

CREATE POLICY wallet_select_self ON winelio.user_wallet_summaries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY wallet_select_admin ON winelio.user_wallet_summaries
  FOR SELECT TO authenticated
  USING (COALESCE(((auth.jwt() -> 'app_metadata') ->> 'role'), '') = 'super_admin');

-- Pas de policy INSERT/UPDATE/DELETE → bloqué pour tout client.
-- Les écritures passent par :
--   - le trigger winelio.handle_new_user (SECURITY DEFINER, INSERT initial)
--   - supabaseAdmin (UPDATE depuis lib/wallet.ts, /api/account/delete)
--   - le trigger on_commission_change (recalcul auto après commission)


-- ── 2. commission_transactions ───────────────────────────────
-- Déjà en lecture seule (SELECT only), on garantit qu'aucune
-- policy d'écriture ne sera ajoutée par erreur. Toutes les
-- INSERTs passent par lib/commission.ts via supabaseAdmin.

DROP POLICY IF EXISTS commission_select       ON winelio.commission_transactions;
DROP POLICY IF EXISTS commission_select_self  ON winelio.commission_transactions;
DROP POLICY IF EXISTS commission_select_admin ON winelio.commission_transactions;

CREATE POLICY commission_select_self ON winelio.commission_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY commission_select_admin ON winelio.commission_transactions
  FOR SELECT TO authenticated
  USING (COALESCE(((auth.jwt() -> 'app_metadata') ->> 'role'), '') = 'super_admin');


-- ── 3. withdrawals ───────────────────────────────────────────
-- Avant : policy ALL avec USING (uid()=user_id) → un user pouvait
-- INSERT, UPDATE (passer status à 'paid'), DELETE ses propres
-- withdrawals. Maintenant : SELECT only, tout passe par l'API
-- /api/wallet/withdraw qui appelle la RPC process_withdrawal.

DROP POLICY IF EXISTS withdrawal_all          ON winelio.withdrawals;
DROP POLICY IF EXISTS withdrawal_select_self  ON winelio.withdrawals;
DROP POLICY IF EXISTS withdrawal_select_admin ON winelio.withdrawals;

CREATE POLICY withdrawal_select_self ON winelio.withdrawals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY withdrawal_select_admin ON winelio.withdrawals
  FOR SELECT TO authenticated
  USING (COALESCE(((auth.jwt() -> 'app_metadata') ->> 'role'), '') = 'super_admin');


-- ── 4. Garde-fou : la RPC process_withdrawal doit être SECURITY DEFINER
-- ────────────────────────────────────────────────────────────
-- La RPC est appelée depuis /api/wallet/withdraw avec un client
-- normal (sans bypass RLS). Sans SECURITY DEFINER, l'INSERT
-- dans winelio.withdrawals serait bloqué par les nouvelles
-- policies. On vérifie + corrige.

DO $$
DECLARE
  is_definer boolean;
BEGIN
  SELECT prosecdef INTO is_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'winelio' AND p.proname = 'process_withdrawal';

  IF is_definer IS NULL THEN
    RAISE NOTICE 'RPC winelio.process_withdrawal introuvable — à vérifier manuellement';
  ELSIF NOT is_definer THEN
    EXECUTE 'ALTER FUNCTION winelio.process_withdrawal(uuid, numeric, text, jsonb, numeric) SECURITY DEFINER';
    RAISE NOTICE 'process_withdrawal passé en SECURITY DEFINER';
  ELSE
    RAISE NOTICE 'process_withdrawal déjà en SECURITY DEFINER';
  END IF;
END $$;
