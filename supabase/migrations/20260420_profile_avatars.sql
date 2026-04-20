-- ============================================================
-- Winelio - Photos de profil
-- ============================================================

-- Bucket public pour les avatars des profils
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage : chaque utilisateur gère ses fichiers via le premier segment du chemin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile avatars insert own'
  ) THEN
    CREATE POLICY "profile avatars insert own"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile avatars select own'
  ) THEN
    CREATE POLICY "profile avatars select own"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'profile-avatars'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile avatars update own'
  ) THEN
    CREATE POLICY "profile avatars update own"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'profile avatars delete own'
  ) THEN
    CREATE POLICY "profile avatars delete own"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'profile-avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
