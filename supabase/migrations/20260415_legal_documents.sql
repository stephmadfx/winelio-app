-- supabase/migrations/20260415_legal_documents.sql

-- Fonction trigger updated_at (absente du schéma public dans ce Supabase self-hosted)
CREATE OR REPLACE FUNCTION winelio.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS winelio.legal_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  version      text NOT NULL DEFAULT '1.0',
  status       text NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'reviewing', 'validated')),
  created_by   uuid REFERENCES winelio.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.document_sections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES winelio.legal_documents(id) ON DELETE CASCADE,
  order_index    int NOT NULL,
  article_number text NOT NULL,
  title          text NOT NULL,
  content        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.document_annotations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES winelio.document_sections(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES winelio.profiles(id),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winelio.document_placeholder_values (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES winelio.legal_documents(id) ON DELETE CASCADE,
  placeholder_key  text NOT NULL,
  value            text NOT NULL,
  filled_by        uuid NOT NULL REFERENCES winelio.profiles(id),
  filled_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, placeholder_key)
);

CREATE INDEX IF NOT EXISTS idx_document_sections_document_id
  ON winelio.document_sections(document_id, order_index);

CREATE INDEX IF NOT EXISTS idx_document_annotations_section_id
  ON winelio.document_annotations(section_id, created_at);

DROP TRIGGER IF EXISTS update_legal_documents_updated_at ON winelio.legal_documents;
CREATE TRIGGER update_legal_documents_updated_at
  BEFORE UPDATE ON winelio.legal_documents
  FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at_column();

DROP TRIGGER IF EXISTS update_document_annotations_updated_at ON winelio.document_annotations;
CREATE TRIGGER update_document_annotations_updated_at
  BEFORE UPDATE ON winelio.document_annotations
  FOR EACH ROW EXECUTE FUNCTION winelio.update_updated_at_column();

ALTER TABLE winelio.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.document_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.document_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.document_placeholder_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all_legal_documents"
  ON winelio.legal_documents FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

CREATE POLICY "super_admin_all_document_sections"
  ON winelio.document_sections FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

CREATE POLICY "super_admin_all_document_annotations"
  ON winelio.document_annotations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

CREATE POLICY "super_admin_all_document_placeholder_values"
  ON winelio.document_placeholder_values FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
