-- supabase/migrations/20260420_bug_reports_board.sql

ALTER TABLE winelio.bug_reports
  ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'bug',
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  ALTER TABLE winelio.bug_reports
    ADD CONSTRAINT bug_reports_tracking_status_check
    CHECK (tracking_status IN ('todo', 'in_progress', 'blocked', 'done'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE winelio.bug_reports
    ADD CONSTRAINT bug_reports_ticket_type_check
    CHECK (ticket_type IN ('bug', 'improvement', 'site_change'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE winelio.bug_reports
    ADD CONSTRAINT bug_reports_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION winelio.update_bug_reports_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bug_reports_updated_at ON winelio.bug_reports;
CREATE TRIGGER update_bug_reports_updated_at
  BEFORE UPDATE ON winelio.bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION winelio.update_bug_reports_updated_at();
