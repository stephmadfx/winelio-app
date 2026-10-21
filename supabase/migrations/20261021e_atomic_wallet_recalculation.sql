BEGIN;
-- Même verrou que process_withdrawal et le trigger des commissions : aucun solde réservé perdu.
CREATE OR REPLACE FUNCTION winelio.recalculate_wallet(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_earned numeric;
  v_pending numeric;
  v_withdrawn numeric;
  v_wins numeric;
  v_redeemed numeric;
BEGIN
  INSERT INTO winelio.user_wallet_summaries(user_id) VALUES(p_user_id)
    ON CONFLICT(user_id) DO NOTHING;
  SELECT coalesce(redeemed_wins,0) INTO STRICT v_redeemed
    FROM winelio.user_wallet_summaries WHERE user_id=p_user_id FOR UPDATE;
  SELECT
    coalesce(sum(amount) FILTER (WHERE status='EARNED' AND type<>'professional_cashback'),0),
    coalesce(sum(amount) FILTER (WHERE status='PENDING' AND type<>'professional_cashback'),0),
    coalesce(sum(amount) FILTER (WHERE status='EARNED' AND type='professional_cashback'),0)
  INTO v_earned,v_pending,v_wins
  FROM winelio.commission_transactions WHERE user_id=p_user_id;
  SELECT coalesce(sum(amount),0) INTO v_withdrawn FROM winelio.withdrawals
    WHERE user_id=p_user_id AND status IN ('PENDING','PROCESSING','COMPLETED');
  UPDATE winelio.user_wallet_summaries SET
    total_earned=v_earned,total_withdrawn=v_withdrawn,pending_commissions=v_pending,
    available=greatest(0,v_earned-v_withdrawn),total_wins=v_wins,
    available_wins=greatest(0,v_wins-v_redeemed),updated_at=now()
    WHERE user_id=p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION winelio.recalculate_wallet(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION winelio.recalculate_wallet(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
