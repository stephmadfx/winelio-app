-- ============================================================
-- Migration 011 : corrections critiques commissions + retraits
-- Problèmes résolus :
--   1. Contrainte CHECK type trop restrictive (manque manual_adjustment)
--   2. recommendation_id NOT NULL bloque les ajustements manuels
--   3. Colonne notes manquante sur commission_transactions
--   4. RPC process_withdrawal utilise de mauvaises colonnes (payment_method/payment_details)
--   5. Aucun trigger pour mettre à jour user_wallet_summaries lors des commissions
-- ============================================================

-- ─── 1. Contrainte type : ajouter manual_adjustment ──────────────────────────

ALTER TABLE winelio.commission_transactions
  DROP CONSTRAINT IF EXISTS commission_transactions_type_check;

ALTER TABLE winelio.commission_transactions
  ADD CONSTRAINT commission_transactions_type_check CHECK (type = ANY (ARRAY[
    'recommendation'::text,
    'referral_level_1'::text,
    'referral_level_2'::text,
    'referral_level_3'::text,
    'referral_level_4'::text,
    'referral_level_5'::text,
    'affiliation_bonus'::text,
    'professional_cashback'::text,
    'manual_adjustment'::text
  ]));

-- ─── 2. recommendation_id nullable (pour ajustements manuels) ────────────────

ALTER TABLE winelio.commission_transactions
  ALTER COLUMN recommendation_id DROP NOT NULL;

-- ─── 3. Colonne notes ─────────────────────────────────────────────────────────

ALTER TABLE winelio.commission_transactions
  ADD COLUMN IF NOT EXISTS notes text;

-- ─── 4. RPC process_withdrawal : corriger colonnes et casse status ────────────
-- La table winelio.withdrawals a : method (pas payment_method), bank_details (pas payment_details)
-- Le statut doit être 'PENDING' (majuscule) pour respecter la CHECK constraint

CREATE OR REPLACE FUNCTION winelio.process_withdrawal(
  p_user_id        uuid,
  p_amount         numeric,
  p_payment_method text,
  p_payment_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available numeric;
  v_withdrawn numeric;
BEGIN
  -- Verrouille la ligne pour éviter les races concurrentes
  SELECT available, total_withdrawn
  INTO v_available, v_withdrawn
  FROM winelio.user_wallet_summaries
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'wallet_not_found');
  END IF;

  IF v_available < p_amount THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  -- Insère la demande de retrait (colonnes réelles : method + bank_details)
  INSERT INTO winelio.withdrawals (user_id, amount, method, bank_details, status)
  VALUES (p_user_id, p_amount, p_payment_method, p_payment_details, 'PENDING');

  -- Met à jour le solde
  UPDATE winelio.user_wallet_summaries
  SET
    available       = available - p_amount,
    total_withdrawn = COALESCE(total_withdrawn, 0) + p_amount,
    updated_at      = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 5. Trigger wallet : mise à jour automatique lors des commissions ─────────

CREATE OR REPLACE FUNCTION winelio.update_wallet_on_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN

    IF NEW.status = 'EARNED' THEN
      UPDATE winelio.user_wallet_summaries
      SET total_earned = total_earned + NEW.amount,
          available    = available    + NEW.amount,
          updated_at   = now()
      WHERE user_id = NEW.user_id;

    ELSIF NEW.status = 'PENDING' THEN
      UPDATE winelio.user_wallet_summaries
      SET pending_commissions = pending_commissions + NEW.amount,
          updated_at          = now()
      WHERE user_id = NEW.user_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN

    -- PENDING → EARNED : libère les fonds
    IF OLD.status = 'PENDING' AND NEW.status = 'EARNED' THEN
      UPDATE winelio.user_wallet_summaries
      SET pending_commissions = GREATEST(0, pending_commissions - OLD.amount),
          total_earned        = total_earned + NEW.amount,
          available           = available    + NEW.amount,
          updated_at          = now()
      WHERE user_id = NEW.user_id;

    -- EARNED → CANCELLED : retire les fonds
    ELSIF OLD.status = 'EARNED' AND NEW.status = 'CANCELLED' THEN
      UPDATE winelio.user_wallet_summaries
      SET total_earned = GREATEST(0, total_earned - OLD.amount),
          available    = GREATEST(0, available    - OLD.amount),
          updated_at   = now()
      WHERE user_id = NEW.user_id;

    -- PENDING → CANCELLED : retire de l'en attente
    ELSIF OLD.status = 'PENDING' AND NEW.status = 'CANCELLED' THEN
      UPDATE winelio.user_wallet_summaries
      SET pending_commissions = GREATEST(0, pending_commissions - OLD.amount),
          updated_at          = now()
      WHERE user_id = NEW.user_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_commission_change ON winelio.commission_transactions;

CREATE TRIGGER on_commission_change
  AFTER INSERT OR UPDATE ON winelio.commission_transactions
  FOR EACH ROW EXECUTE FUNCTION winelio.update_wallet_on_commission();
