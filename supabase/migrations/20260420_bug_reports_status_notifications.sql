-- Track bug notification emails so they are sent only once per milestone.

ALTER TABLE winelio.bug_reports
  ADD COLUMN IF NOT EXISTS in_progress_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS done_notified_at timestamptz;
