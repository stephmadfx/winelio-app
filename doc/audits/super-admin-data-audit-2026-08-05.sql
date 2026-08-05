-- Audit en lecture seule du Super Admin Winelio.
-- Snapshot de référence : 2026-08-05, Europe/Paris.
-- Exécution : psql -U supabase_admin -d postgres -f <ce-fichier>

SET TIME ZONE 'Europe/Paris';

-- Périmètre profils : affiché par la vue actuelle vs comptes réels non-démo.
SELECT
  count(*) AS profiles_real_view,
  count(*) FILTER (WHERE is_demo) AS demo_profiles,
  count(*) FILTER (WHERE NOT COALESCE(is_demo, false)) AS non_demo_profiles
FROM winelio.profiles_real;

SELECT count(*) AS active_real_auth_users
FROM auth.users au
JOIN winelio.profiles p ON p.id = au.id
WHERE p.is_active
  AND NOT COALESCE(p.is_demo, false)
  AND NOT winelio.is_e2e_email(p.email);

-- Recommandations et commissions : séparer systématiquement réel et démo.
SELECT
  count(*) AS recommendations,
  count(*) FILTER (WHERE is_demo) AS demo,
  count(*) FILTER (WHERE NOT COALESCE(is_demo, false)) AS real
FROM winelio.recommendations_real;

SELECT
  status,
  count(*) AS transactions,
  count(*) FILTER (WHERE is_demo) AS demo_transactions,
  COALESCE(sum(amount), 0) AS amount
FROM winelio.commissions_real
GROUP BY status
ORDER BY status;

-- Vérifier que le bénéficiaire obligatoire de la cagnotte existe.
SELECT count(*) AS winelio_system_profile
FROM winelio.profiles
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Complétude de la ventilation pour les recommandations éligibles.
WITH eligible AS (
  SELECT id
  FROM winelio.recommendations
  WHERE status IN ('QUOTE_VALIDATED', 'PAYMENT_RECEIVED', 'COMPLETED')
), commission_coverage AS (
  SELECT
    recommendation_id,
    count(*) FILTER (WHERE type = 'recommendation') AS direct_count,
    count(*) FILTER (WHERE type = 'platform_winelio') AS platform_count,
    count(*) FILTER (WHERE type = 'professional_cashback') AS cashback_count,
    count(*) FILTER (WHERE type LIKE 'referral_level_%') AS network_count
  FROM winelio.commission_transactions
  GROUP BY recommendation_id
)
SELECT
  count(*) AS eligible_recommendations,
  count(*) FILTER (WHERE COALESCE(direct_count, 0) = 0) AS missing_direct,
  count(*) FILTER (WHERE COALESCE(platform_count, 0) = 0) AS missing_platform,
  count(*) FILTER (WHERE COALESCE(cashback_count, 0) = 0) AS missing_cashback
FROM eligible e
LEFT JOIN commission_coverage c ON c.recommendation_id = e.id;

-- Entreprises réellement actives et couverture par un compte Auth.
SELECT
  count(*) AS live_owner_companies,
  count(*) FILTER (WHERE au.id IS NOT NULL) AS auth_backed,
  count(*) FILTER (WHERE au.id IS NULL) AS without_auth_account
FROM winelio.companies_real c
LEFT JOIN auth.users au ON au.id = c.owner_id
WHERE c.source = 'owner'
  AND c.deleted_at IS NULL;

-- Contrôle de cohérence des caches wallet.
WITH calculated AS (
  SELECT
    p.id,
    COALESCE(sum(c.amount) FILTER (
      WHERE c.status = 'EARNED' AND c.type <> 'professional_cashback'
    ), 0) AS earned,
    COALESCE(sum(c.amount) FILTER (
      WHERE c.status = 'PENDING' AND c.type <> 'professional_cashback'
    ), 0) AS pending,
    COALESCE(sum(c.amount) FILTER (
      WHERE c.status = 'EARNED' AND c.type = 'professional_cashback'
    ), 0) AS wins
  FROM winelio.profiles_real p
  LEFT JOIN winelio.commission_transactions c ON c.user_id = p.id
  GROUP BY p.id
)
SELECT
  count(*) FILTER (WHERE abs(COALESCE(w.total_earned, 0) - c.earned) > 0.005) AS earned_mismatches,
  count(*) FILTER (WHERE abs(COALESCE(w.pending_commissions, 0) - c.pending) > 0.005) AS pending_mismatches,
  count(*) FILTER (WHERE abs(COALESCE(w.total_wins, 0) - c.wins) > 0.005) AS wins_mismatches
FROM calculated c
LEFT JOIN winelio.user_wallet_summaries w ON w.user_id = c.id;
