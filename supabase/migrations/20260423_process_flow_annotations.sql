CREATE TABLE IF NOT EXISTS winelio.process_flow_annotations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    text        NOT NULL,
  content    text        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  author_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS process_flow_annotations_node_id_idx
  ON winelio.process_flow_annotations (node_id);

ALTER TABLE winelio.process_flow_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all" ON winelio.process_flow_annotations;

CREATE POLICY "super_admin_all" ON winelio.process_flow_annotations
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
