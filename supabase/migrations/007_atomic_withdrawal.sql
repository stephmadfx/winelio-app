-- Migration 007 : retrait atomique via RPC + contrainte unicité commissions
-- Applique l'insertion du retrait et la mise à jour du solde dans une seule transaction

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

  -- Insère la demande de retrait
  INSERT INTO winelio.withdrawals (user_id, amount, payment_method, payment_details, status)
  VALUES (p_user_id, p_amount, p_payment_method, p_payment_details, 'pending');

  -- Met à jour le solde
  UPDATE winelio.user_wallet_summaries
  SET
    available       = available - p_amount,
    total_withdrawn = COALESCE(total_withdrawn, 0) + p_amount
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Contrainte d'unicité sur les commissions pour éviter les doublons
ALTER TABLE winelio.commission_transactions
  DROP CONSTRAINT IF EXISTS uq_commission_per_reco_type_level;

ALTER TABLE winelio.commission_transactions
  ADD CONSTRAINT uq_commission_per_reco_type_level
  UNIQUE (recommendation_id, type, level, user_id);
