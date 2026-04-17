-- Migration : frais de retrait Stripe
-- Retraits < 50 € → 0,25 € de frais (virement SEPA Stripe)
-- Retraits ≥ 50 € → gratuit

-- 1. Ajouter la colonne fee_amount sur la table withdrawals
ALTER TABLE winelio.withdrawals
  ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0;

-- 2. Mettre à jour le RPC pour accepter et stocker le montant des frais
CREATE OR REPLACE FUNCTION winelio.process_withdrawal(
  p_user_id         uuid,
  p_amount          numeric,
  p_payment_method  text,
  p_payment_details jsonb,
  p_fee_amount      numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available numeric;
  v_withdrawn numeric;
BEGIN
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

  INSERT INTO winelio.withdrawals (user_id, amount, fee_amount, method, bank_details, status)
  VALUES (p_user_id, p_amount, p_fee_amount, p_payment_method, p_payment_details, 'PENDING');

  UPDATE winelio.user_wallet_summaries
  SET
    available       = available - p_amount,
    total_withdrawn = COALESCE(total_withdrawn, 0) + p_amount,
    updated_at      = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
