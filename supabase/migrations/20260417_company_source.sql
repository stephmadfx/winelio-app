-- Distinguer les entreprises enregistrées par leur propriétaire vs scrapées
-- 'owner'   : inscrite via le formulaire par le propriétaire (connaît Winelio)
-- 'scraped' : injectée depuis une base externe (ne connaît pas Winelio)
ALTER TABLE winelio.companies
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'owner'
  CHECK (source IN ('owner', 'scraped'));
