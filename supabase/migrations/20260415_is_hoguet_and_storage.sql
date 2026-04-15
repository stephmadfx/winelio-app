-- supabase/migrations/20260415_is_hoguet_and_storage.sql

-- 1. Colonne is_hoguet sur winelio.categories
ALTER TABLE winelio.categories
  ADD COLUMN IF NOT EXISTS is_hoguet boolean NOT NULL DEFAULT false;

-- 2. Bucket Supabase Storage pour les signatures légales
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-signatures', 'legal-signatures', true)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS : lecture publique sur le bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read legal-signatures'
  ) THEN
    CREATE POLICY "Public read legal-signatures"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'legal-signatures');
  END IF;
END $$;
