-- Align compensation plan defaults with the active Winelio standard plan.
-- Scope intentionally limited to the winelio schema because this Supabase
-- instance is shared with other applications.

BEGIN;

ALTER TABLE winelio.compensation_plans
  ALTER COLUMN level_1_percentage SET DEFAULT 3,
  ALTER COLUMN level_2_percentage SET DEFAULT 3,
  ALTER COLUMN level_3_percentage SET DEFAULT 3,
  ALTER COLUMN level_4_percentage SET DEFAULT 3,
  ALTER COLUMN level_5_percentage SET DEFAULT 3,
  ALTER COLUMN platform_percentage SET DEFAULT 23;

UPDATE winelio.compensation_plans
SET
  level_1_percentage = 3,
  level_2_percentage = 3,
  level_3_percentage = 3,
  level_4_percentage = 3,
  level_5_percentage = 3,
  platform_percentage = 23,
  updated_at = now()
WHERE is_default = true
  AND is_active = true
  AND (
    level_1_percentage IS DISTINCT FROM 3 OR
    level_2_percentage IS DISTINCT FROM 3 OR
    level_3_percentage IS DISTINCT FROM 3 OR
    level_4_percentage IS DISTINCT FROM 3 OR
    level_5_percentage IS DISTINCT FROM 3 OR
    platform_percentage IS DISTINCT FROM 23
  );

COMMIT;
