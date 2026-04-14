-- Backfill cagnotte Winelio pour les commissions créées avant la migration 20260414
-- Calcul : plateforme 14% = (montant referrer / 60) * 14 (même logique que calculateCommissions)
-- Idempotent via ON CONFLICT DO NOTHING

INSERT INTO winelio.commission_transactions
  (recommendation_id, user_id, amount, type, level, status, referrer_id, earned_at, is_demo)
SELECT
  ct.recommendation_id,
  '00000000-0000-0000-0000-000000000001',
  ROUND((ct.amount / 60.0 * 14.0)::numeric, 2),
  'platform_winelio',
  0,
  'EARNED',
  ct.user_id,
  COALESCE(ct.earned_at, ct.created_at),
  ct.is_demo
FROM winelio.commission_transactions ct
WHERE ct.type = 'recommendation'
ON CONFLICT (recommendation_id, type, level, user_id) DO NOTHING;
