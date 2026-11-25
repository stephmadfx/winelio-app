-- Familles de métiers (proposition Thierry, 25/11/2026) : un niveau au-dessus des catégories,
-- utilisé pour regrouper les listes déroulantes. Les fiches gardent leur catégorie.
BEGIN;

CREATE TABLE IF NOT EXISTS winelio.category_families (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  slug       text NOT NULL UNIQUE,
  sort_order int  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE winelio.category_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS category_families_select ON winelio.category_families;
CREATE POLICY category_families_select ON winelio.category_families FOR SELECT USING (true);
GRANT SELECT ON winelio.category_families TO anon, authenticated;
GRANT ALL ON winelio.category_families TO service_role;

ALTER TABLE winelio.categories
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES winelio.category_families(id);

INSERT INTO winelio.category_families (name, slug, sort_order) VALUES
  ('Habitat et travaux',       'habitat-travaux',         1),
  ('Immobilier',               'immobilier',              2),
  ('Transport et manutention', 'transport-manutention',   3),
  ('Assurance',                'assurance',               4),
  ('Financement',              'financement',             5),
  ('Coaching et formation',    'coaching-formation',      6),
  ('Événementiel',             'evenementiel',            7),
  ('Services aux entreprises', 'services-entreprises',    8),
  ('Autres services',          'autres-services',         9)
ON CONFLICT (slug) DO NOTHING;

-- Métiers cités par Thierry absents de la base
INSERT INTO winelio.categories (name, slug)
SELECT v.name, v.slug FROM (VALUES
  ('Chauffage',                            'chauffage'),
  ('Carrelage',                            'carrelage'),
  ('Rénovation',                           'renovation'),
  ('Isolation et rénovation énergétique',  'isolation-renovation-energetique'),
  ('Débarras et aménagement',              'debarras-amenagement'),
  ('Diagnostic immobilier',                'diagnostic-immobilier'),
  ('Formation',                            'formation')
) AS v(name, slug)
WHERE NOT EXISTS (SELECT 1 FROM winelio.categories c WHERE c.slug = v.slug OR c.name = v.name);

UPDATE winelio.categories c SET family_id = f.id
FROM (VALUES
  ('Électricité', 'habitat-travaux'), ('Plomberie', 'habitat-travaux'), ('Chauffage', 'habitat-travaux'),
  ('Climatisation', 'habitat-travaux'), ('Menuiserie', 'habitat-travaux'), ('Toiture', 'habitat-travaux'),
  ('Peinture', 'habitat-travaux'), ('Maçonnerie', 'habitat-travaux'), ('Carrelage', 'habitat-travaux'),
  ('Rénovation', 'habitat-travaux'), ('Isolation et rénovation énergétique', 'habitat-travaux'),
  ('Jardinage', 'habitat-travaux'), ('Débarras et aménagement', 'habitat-travaux'),
  ('Immobilier', 'immobilier'), ('Diagnostic immobilier', 'immobilier'),
  ('Déménagement', 'transport-manutention'),
  ('Assurance', 'assurance'),
  ('Courtier en crédit', 'financement'),
  ('Coaching en développement personnel', 'coaching-formation'), ('Formation', 'coaching-formation'),
  ('Événementiel', 'evenementiel'),
  ('Comptabilité', 'services-entreprises'), ('Juridique', 'services-entreprises'), ('Informatique', 'services-entreprises'),
  ('Automobile', 'autres-services'), ('Nettoyage', 'autres-services')
) AS m(category, family)
JOIN winelio.category_families f ON f.slug = m.family
WHERE c.name = m.category;

COMMIT;

NOTIFY pgrst, 'reload schema';
