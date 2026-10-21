BEGIN;
CREATE VIEW winelio.accounting_payments_to_review WITH (security_invoker=true) AS
SELECT s.id,s.recommendation_id,s.amount,s.paid_at
FROM winelio.stripe_payment_sessions s
JOIN winelio.recommendations r ON r.id=s.recommendation_id
JOIN winelio.profiles p ON p.id=r.professional_id
WHERE s.status='paid' AND NOT coalesce(r.is_demo,false) AND NOT coalesce(p.is_demo,false)
  AND NOT EXISTS (SELECT 1 FROM winelio.accounting_documents d WHERE d.kind='invoice' AND d.recommendation_id=r.id);
REVOKE ALL ON winelio.accounting_payments_to_review FROM PUBLIC,anon,authenticated;
GRANT SELECT ON winelio.accounting_payments_to_review TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
