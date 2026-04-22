-- Backfill de la colonne source selon le propriétaire réel.
--
-- Règle : une company est 'owner' quand le user propriétaire a un vrai email
-- (pas un placeholder généré par une campagne de scraping).
-- Les placeholders connus :
--   - @kiparlo-pro.fr          (ancien seeding migré depuis Winko)
--   - @winelio-scraped.local   (imports via /api/admin/scraping/import)
--   - @winko%                  (anciens comptes Winko scrapés)
--
-- Sinon la company reste / devient 'scraped'.

-- 1. Tout remettre par défaut à 'scraped' avant de requalifier
UPDATE winelio.companies
SET source = 'scraped'
WHERE source = 'owner';

-- 2. Requalifier en 'owner' quand l'email du propriétaire est réel
UPDATE winelio.companies c
SET source = 'owner'
FROM auth.users u
WHERE c.owner_id = u.id
  AND u.email NOT LIKE '%kiparlo-pro.fr'
  AND u.email NOT LIKE '%winelio-scraped.local'
  AND u.email NOT LIKE '%@winko%';
