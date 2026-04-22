-- Backfill : marquer toutes les companies existantes comme 'scraped'
-- sauf celles dont le owner est un super_admin (Thierry, Christophe, Stéphane).
-- Les futurs pros qui s'inscrivent eux-mêmes récupèrent 'owner' via le default.

UPDATE winelio.companies
SET source = 'scraped'
WHERE owner_id NOT IN (
  SELECT id FROM auth.users WHERE raw_app_meta_data->>'role' = 'super_admin'
)
AND source = 'owner';
