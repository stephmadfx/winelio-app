-- Restaure app=winelio sur les auth.users qui ont déjà un profil Winelio.
-- Cause : verify-code écrasait raw_user_meta_data sans le marker à chaque OTP,
-- ce qui faisait remonter ces comptes comme « profils fantômes » au cron auth-health.

UPDATE auth.users u
SET raw_user_meta_data = jsonb_set(
  COALESCE(u.raw_user_meta_data, '{}'::jsonb),
  '{app}',
  '"winelio"'::jsonb,
  true
)
WHERE u.id <> '00000000-0000-0000-0000-000000000001'
  AND EXISTS (
    SELECT 1
    FROM winelio.profiles p
    WHERE p.id = u.id
      AND COALESCE(p.is_demo, false) = false
      AND p.email NOT LIKE '%@winelio-e2e.local'
      AND p.email NOT LIKE '%@winelio-demo.internal'
  )
  AND COALESCE(u.raw_user_meta_data->>'app', '') <> 'winelio';
