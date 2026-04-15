-- supabase/migrations/20260415_legal_signatures_private.sql
-- Correction : passer le bucket legal-signatures en privé
-- et remplacer la policy lecture publique par une policy owner + super_admin

UPDATE storage.buckets SET public = false WHERE id = 'legal-signatures';

DROP POLICY IF EXISTS "Public read legal-signatures" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Owner or admin read legal-signatures'
  ) THEN
    CREATE POLICY "Owner or admin read legal-signatures"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'legal-signatures'
        AND (
          (storage.foldername(name))[2] = auth.uid()::text
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
        )
      );
  END IF;
END $$;
