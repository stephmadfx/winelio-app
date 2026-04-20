-- ============================================================
-- Winelio - Source des cartes bugs & idées
-- ============================================================

ALTER TABLE winelio.bug_reports
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  ALTER TABLE winelio.bug_reports
    ADD CONSTRAINT bug_reports_source_check
    CHECK (source IN ('user', 'manual'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
