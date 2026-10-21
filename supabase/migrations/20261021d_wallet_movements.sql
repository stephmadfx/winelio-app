BEGIN;
-- Une seule pagination chronologique : aucune limite silencieuse à 1000 mouvements par source.
CREATE VIEW winelio.wallet_movements WITH (security_invoker=true) AS
SELECT id,user_id,'commission'::text AS type,amount,created_at,
  CASE WHEN status='EARNED' THEN 'completed' ELSE lower(status) END AS status,
  CASE WHEN type='professional_cashback' THEN 'Cashback professionnel'
    WHEN coalesce(level,0)=0 THEN 'Commission directe'
    ELSE 'Commission niveau ' || level END AS description,
  (type='professional_cashback') AS wins
FROM winelio.commission_transactions
UNION ALL
SELECT id,user_id,'withdrawal',amount,created_at,lower(status),
  CASE WHEN method='paypal' THEN 'Retrait - PayPal' ELSE 'Retrait - Virement bancaire' END,false
FROM winelio.withdrawals;
REVOKE ALL ON winelio.wallet_movements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON winelio.wallet_movements TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
