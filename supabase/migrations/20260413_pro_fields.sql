-- supabase/migrations/20260413_pro_fields.sql
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS work_mode TEXT
    CHECK (work_mode IN ('remote', 'onsite', 'both')),
  ADD COLUMN IF NOT EXISTS pro_engagement_accepted BOOLEAN NOT NULL DEFAULT false;
