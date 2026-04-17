-- Table d'état pour la rotation séquentielle des fondateurs (têtes de lignée).
-- Chaque nouvel inscrit sans code parrain est assigné au fondateur suivant
-- dans l'ordre de création, pur round-robin, indépendamment de son nombre
-- de filleuls. Plus juste que "celui qui a le moins de filleuls".

CREATE TABLE IF NOT EXISTS winelio.founder_rotation (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_founder_id UUID REFERENCES winelio.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO winelio.founder_rotation (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
