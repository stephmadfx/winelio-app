-- supabase/migrations/20260410_bug_reports.sql

-- Table
CREATE TABLE IF NOT EXISTS winelio.bug_reports (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message        TEXT NOT NULL,
  screenshot_url TEXT,
  page_url       TEXT,
  status         TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'replied')),
  admin_reply    TEXT,
  replied_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE winelio.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bug_reports_select_own"
  ON winelio.bug_reports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "bug_reports_insert_own"
  ON winelio.bug_reports FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Note: les UPDATE/SELECT admin (status, admin_reply) utilisent supabaseAdmin (service role) — pas de policy RLS nécessaire.

-- Storage bucket (privé)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "bug_screenshots_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bug-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

ALTER PUBLICATION supabase_realtime ADD TABLE winelio.bug_reports;
