-- ============================================================
-- Migration 015 : réseau demo automatique
-- ============================================================

-- ─── Colonnes is_demo + demo_owner_id ─────────────────────

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS is_demo        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_owner_id  uuid REFERENCES winelio.profiles(id) ON DELETE CASCADE;

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

ALTER TABLE winelio.commission_transactions
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Index pour purge rapide
CREATE INDEX IF NOT EXISTS idx_profiles_demo_owner     ON winelio.profiles(demo_owner_id) WHERE demo_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recommendations_is_demo ON winelio.recommendations(is_demo) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_commissions_is_demo     ON winelio.commission_transactions(is_demo) WHERE is_demo = true;

-- ─── Fonction seed_demo_network ───────────────────────────

CREATE OR REPLACE FUNCTION winelio.seed_demo_network(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_first_names text[] := ARRAY[
    'Marie','Thomas','Sophie','Pierre','Emma','Nicolas','Julie','Antoine',
    'Camille','Lucas','Laura','Maxime','Alice','Julien','Manon','Romain',
    'Lea','Alexandre','Chloe','Mathieu','Ines','Clement','Pauline',
    'Francois','Sarah','Quentin','Elodie','Baptiste','Claire','Guillaume'
  ];
  v_last_names text[] := ARRAY[
    'Martin','Bernard','Dubois','Moreau','Laurent','Simon','Michel',
    'Lefebvre','Leroy','Roux','David','Bertrand','Morel','Fournier',
    'Girard','Bonnet','Dupont','Lambert','Fontaine','Rousseau','Vincent',
    'Muller','Lefevre','Faure','Andre','Mercier','Blanc','Guerin','Boyer','Garnier'
  ];
  v_cities text[] := ARRAY[
    'Lyon','Marseille','Bordeaux','Nantes','Toulouse','Strasbourg',
    'Montpellier','Rennes','Lille','Nice','Grenoble','Rouen','Toulon',
    'Saint-Etienne','Dijon','Angers','Brest','Clermont-Ferrand',
    'Aix-en-Provence','Reims'
  ];
  v_reco_descs text[] := ARRAY[
    'Renovation salle de bain complete','Installation electrique maison neuve',
    'Travaux toiture et etancheite','Pose de parquet et carrelage',
    'Extension garage et amenagement','Remplacement chaudiere et radiateurs',
    'Amenagement cuisine equipee','Peinture interieure appartement 4 pieces',
    'Isolation combles perdus','Creation terrasse bois'
  ];
  v_amounts     numeric[]  := ARRAY[800,1200,1500,2000,2500,3000,4000,5000,7500,10000,12000,15000];
  v_active_st   text[]     := ARRAY['ACCEPTED','CONTACT_MADE','MEETING_SCHEDULED','QUOTE_SUBMITTED'];
  v_valid_st    text[]     := ARRAY['QUOTE_VALIDATED','COMPLETED'];

  v_id          uuid;
  v_reco_id     uuid;
  v_pro_id      uuid;
  v_amount      numeric;
  v_status      text;
  v_is_pro      boolean;
  v_cat_ids     uuid[];
  v_n1          uuid[] := '{}';
  v_n2          uuid[] := '{}';
  v_n3          uuid[] := '{}';
  v_n4          uuid[] := '{}';
  v_rnd         float;
  i int; j int; n int;
BEGIN
  -- Guard : ne pas re-seeder
  IF EXISTS (SELECT 1 FROM winelio.profiles WHERE demo_owner_id = p_user_id LIMIT 1) THEN
    RETURN;
  END IF;

  -- Catégories disponibles
  SELECT ARRAY(SELECT id FROM winelio.categories WHERE is_active = true ORDER BY random())
  INTO v_cat_ids;

  -- ── NIVEAU 1 : 8 filleuls directs ───────────────────────
  FOR i IN 1..8 LOOP
    v_id     := gen_random_uuid();
    v_is_pro := random() < 0.5;
    INSERT INTO winelio.profiles
      (id, email, first_name, last_name, city, is_professional,
       sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
    VALUES (
      v_id,
      'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
      v_first_names[1 + (floor(random() * 30))::int],
      v_last_names [1 + (floor(random() * 30))::int],
      v_cities     [1 + (floor(random() * 20))::int],
      v_is_pro,
      upper(substr(md5(v_id::text), 1, 6)),
      p_user_id, true, p_user_id,
      now() - ((30 + floor(random() * 150))::text || ' days')::interval
    );
    v_n1 := v_n1 || v_id;
  END LOOP;

  -- ── NIVEAU 2 : 2-3 par N1 ─────────────────────────────
  FOR i IN 1..array_length(v_n1, 1) LOOP
    n := 2 + floor(random() * 2)::int;
    FOR j IN 1..n LOOP
      v_id     := gen_random_uuid();
      v_is_pro := random() < 0.4;
      INSERT INTO winelio.profiles
        (id, email, first_name, last_name, city, is_professional,
         sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
      VALUES (
        v_id,
        'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
        v_first_names[1 + (floor(random() * 30))::int],
        v_last_names [1 + (floor(random() * 30))::int],
        v_cities     [1 + (floor(random() * 20))::int],
        v_is_pro,
        upper(substr(md5(v_id::text), 1, 6)),
        v_n1[i], true, p_user_id,
        now() - ((20 + floor(random() * 120))::text || ' days')::interval
      );
      v_n2 := v_n2 || v_id;
    END LOOP;
  END LOOP;

  -- ── NIVEAU 3 : 1-2 pour ~65% des N2 ──────────────────
  FOR i IN 1..array_length(v_n2, 1) LOOP
    IF random() < 0.65 THEN
      n := 1 + floor(random() * 2)::int;
      FOR j IN 1..n LOOP
        v_id     := gen_random_uuid();
        v_is_pro := random() < 0.3;
        INSERT INTO winelio.profiles
          (id, email, first_name, last_name, city, is_professional,
           sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
        VALUES (
          v_id,
          'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
          v_first_names[1 + (floor(random() * 30))::int],
          v_last_names [1 + (floor(random() * 30))::int],
          v_cities     [1 + (floor(random() * 20))::int],
          v_is_pro,
          upper(substr(md5(v_id::text), 1, 6)),
          v_n2[i], true, p_user_id,
          now() - ((10 + floor(random() * 90))::text || ' days')::interval
        );
        v_n3 := v_n3 || v_id;
      END LOOP;
    END IF;
  END LOOP;

  -- ── NIVEAU 4 : 1-2 pour ~60% des N3 ──────────────────
  IF array_length(v_n3, 1) > 0 THEN
    FOR i IN 1..array_length(v_n3, 1) LOOP
      IF random() < 0.6 THEN
        n := 1 + floor(random() * 2)::int;
        FOR j IN 1..n LOOP
          v_id     := gen_random_uuid();
          v_is_pro := random() < 0.2;
          INSERT INTO winelio.profiles
            (id, email, first_name, last_name, city, is_professional,
             sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
          VALUES (
            v_id,
            'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
            v_first_names[1 + (floor(random() * 30))::int],
            v_last_names [1 + (floor(random() * 30))::int],
            v_cities     [1 + (floor(random() * 20))::int],
            v_is_pro,
            upper(substr(md5(v_id::text), 1, 6)),
            v_n3[i], true, p_user_id,
            now() - ((5 + floor(random() * 60))::text || ' days')::interval
          );
          v_n4 := v_n4 || v_id;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ── NIVEAU 5 : 1 pour ~55% des N4 (max 12) ───────────
  IF array_length(v_n4, 1) > 0 THEN
    FOR i IN 1..LEAST(array_length(v_n4, 1), 12) LOOP
      IF random() < 0.55 THEN
        v_id := gen_random_uuid();
        INSERT INTO winelio.profiles
          (id, email, first_name, last_name, city, is_professional,
           sponsor_code, sponsor_id, is_demo, demo_owner_id, created_at)
        VALUES (
          v_id,
          'demo_' || substr(md5(v_id::text), 1, 8) || '@winelio-demo.internal',
          v_first_names[1 + (floor(random() * 30))::int],
          v_last_names [1 + (floor(random() * 30))::int],
          v_cities     [1 + (floor(random() * 20))::int],
          random() < 0.1,
          upper(substr(md5(v_id::text), 1, 6)),
          v_n4[i], true, p_user_id,
          now() - ((1 + floor(random() * 30))::text || ' days')::interval
        );
      END IF;
    END LOOP;
  END IF;

  -- ── ENTREPRISES pour les pros demo ───────────────────
  IF array_length(v_cat_ids, 1) > 0 THEN
    INSERT INTO winelio.companies
      (owner_id, name, legal_name, alias, city, category_id, is_verified, created_at)
    SELECT
      p.id,
      p.last_name || ' Travaux',
      p.last_name || ' Travaux SARL',
      '#' || upper(substr(replace(p.id::text, '-', ''), 1, 6)),
      p.city,
      v_cat_ids[1 + (floor(random() * array_length(v_cat_ids, 1)))::int],
      random() < 0.7,
      p.created_at
    FROM winelio.profiles p
    WHERE p.demo_owner_id = p_user_id AND p.is_professional = true;
  END IF;

  -- ── RECOMMANDATIONS N1 (2-3 chacun) ────────────────
  FOR i IN 1..array_length(v_n1, 1) LOOP
    -- Trouver un professionnel demo différent du referrer
    SELECT id INTO v_pro_id
    FROM winelio.profiles
    WHERE demo_owner_id = p_user_id AND is_professional = true AND id <> v_n1[i]
    ORDER BY random() LIMIT 1;

    IF v_pro_id IS NULL THEN CONTINUE; END IF;

    n := 2 + floor(random() * 2)::int;
    FOR j IN 1..n LOOP
      v_reco_id := gen_random_uuid();
      v_amount  := v_amounts[1 + (floor(random() * 12))::int];
      v_rnd     := random();
      IF v_rnd < 0.30 THEN
        v_status := 'PENDING';
      ELSIF v_rnd < 0.70 THEN
        v_status := v_active_st[1 + (floor(random() * 4))::int];
      ELSE
        v_status := v_valid_st[1 + (floor(random() * 2))::int];
      END IF;

      INSERT INTO winelio.recommendations
        (id, referrer_id, professional_id, project_description,
         status, amount, is_demo, created_at, updated_at)
      VALUES (
        v_reco_id, v_n1[i], v_pro_id,
        v_reco_descs[1 + (floor(random() * 10))::int],
        v_status, v_amount, true,
        now() - ((floor(random() * 100))::text || ' days')::interval,
        now() - ((floor(random() * 20))::text  || ' days')::interval
      );

      -- Commission pour reco validée (niveau 1 = 4% de la commission 10%)
      IF v_status = ANY(v_valid_st) THEN
        INSERT INTO winelio.commission_transactions
          (user_id, recommendation_id, amount, level, type, status,
           referrer_id, is_demo, earned_at, created_at)
        VALUES (
          p_user_id, v_reco_id,
          ROUND(v_amount * 0.10 * 0.04, 2),
          1, 'referral_level_1', 'EARNED',
          v_n1[i], true, now(), now()
        );
      ELSIF v_status = ANY(v_active_st) THEN
        INSERT INTO winelio.commission_transactions
          (user_id, recommendation_id, amount, level, type, status,
           referrer_id, is_demo, created_at)
        VALUES (
          p_user_id, v_reco_id,
          ROUND(v_amount * 0.10 * 0.04, 2),
          1, 'referral_level_1', 'PENDING',
          v_n1[i], true, now()
        );
      END IF;
    END LOOP;
  END LOOP;

  -- ── RECOMMANDATIONS N2 (1 chacun, 70% de chance) ───
  FOR i IN 1..array_length(v_n2, 1) LOOP
    IF random() > 0.7 THEN CONTINUE; END IF;

    SELECT id INTO v_pro_id
    FROM winelio.profiles
    WHERE demo_owner_id = p_user_id AND is_professional = true AND id <> v_n2[i]
    ORDER BY random() LIMIT 1;

    IF v_pro_id IS NULL THEN CONTINUE; END IF;

    v_reco_id := gen_random_uuid();
    v_amount  := v_amounts[1 + (floor(random() * 12))::int];
    v_rnd     := random();
    IF v_rnd < 0.30 THEN
      v_status := 'PENDING';
    ELSIF v_rnd < 0.70 THEN
      v_status := v_active_st[1 + (floor(random() * 4))::int];
    ELSE
      v_status := v_valid_st[1 + (floor(random() * 2))::int];
    END IF;

    INSERT INTO winelio.recommendations
      (id, referrer_id, professional_id, project_description,
       status, amount, is_demo, created_at, updated_at)
    VALUES (
      v_reco_id, v_n2[i], v_pro_id,
      v_reco_descs[1 + (floor(random() * 10))::int],
      v_status, v_amount, true,
      now() - ((floor(random() * 60))::text || ' days')::interval,
      now() - ((floor(random() * 10))::text  || ' days')::interval
    );

    IF v_status = ANY(v_valid_st) THEN
      INSERT INTO winelio.commission_transactions
        (user_id, recommendation_id, amount, level, type, status,
         referrer_id, is_demo, earned_at, created_at)
      VALUES (
        p_user_id, v_reco_id,
        ROUND(v_amount * 0.10 * 0.04, 2),
        2, 'referral_level_2', 'EARNED',
        v_n2[i], true, now(), now()
      );
    ELSIF v_status = ANY(v_active_st) THEN
      INSERT INTO winelio.commission_transactions
        (user_id, recommendation_id, amount, level, type, status,
         referrer_id, is_demo, created_at)
      VALUES (
        p_user_id, v_reco_id,
        ROUND(v_amount * 0.10 * 0.04, 2),
        2, 'referral_level_2', 'PENDING',
        v_n2[i], true, now()
      );
    END IF;
  END LOOP;

  -- ── RECOMMANDATIONS PROPRES DE L'UTILISATEUR (4-5) ─────────
  -- Garantit que "Reco ce mois" affiche des données non nulles
  FOR i IN 1..(4 + floor(random() * 2)::int) LOOP
    SELECT id INTO v_pro_id
    FROM winelio.profiles
    WHERE demo_owner_id = p_user_id AND is_professional = true
    ORDER BY random() LIMIT 1;

    IF v_pro_id IS NULL THEN CONTINUE; END IF;

    v_reco_id := gen_random_uuid();
    v_amount  := v_amounts[1 + (floor(random() * 12))::int];
    v_rnd     := random();
    IF v_rnd < 0.30 THEN
      v_status := 'PENDING';
    ELSIF v_rnd < 0.70 THEN
      v_status := v_active_st[1 + (floor(random() * 4))::int];
    ELSE
      v_status := v_valid_st[1 + (floor(random() * 2))::int];
    END IF;

    -- Les 2 premières recos dans le mois courant, les suivantes dans les 1-3 mois passés
    INSERT INTO winelio.recommendations
      (id, referrer_id, professional_id, project_description,
       status, amount, is_demo, created_at, updated_at)
    VALUES (
      v_reco_id, p_user_id, v_pro_id,
      v_reco_descs[1 + (floor(random() * 10))::int],
      v_status, v_amount, true,
      CASE WHEN i <= 2
        THEN now() - ((floor(random() * 10))::text || ' days')::interval
        ELSE now() - ((20 + floor(random() * 50))::text || ' days')::interval
      END,
      now() - ((floor(random() * 3))::text || ' days')::interval
    );

    IF v_status = ANY(v_valid_st) THEN
      INSERT INTO winelio.commission_transactions
        (user_id, recommendation_id, amount, level, type, status,
         referrer_id, is_demo, earned_at, created_at)
      VALUES (
        p_user_id, v_reco_id, ROUND(v_amount * 0.10 * 0.60, 2),
        0, 'recommendation', 'EARNED',
        p_user_id, true, now(), now()
      );
    ELSIF v_status = ANY(v_active_st) THEN
      INSERT INTO winelio.commission_transactions
        (user_id, recommendation_id, amount, level, type, status,
         referrer_id, is_demo, created_at)
      VALUES (
        p_user_id, v_reco_id, ROUND(v_amount * 0.10 * 0.60, 2),
        0, 'recommendation', 'PENDING',
        p_user_id, true, now()
      );
    END IF;
  END LOOP;

  -- Note : le trigger winelio.update_wallet_on_commission met à jour
  -- automatiquement user_wallet_summaries à chaque INSERT commission.

END;
$$;

-- ─── Fonction purge_demo_network ──────────────────────────

CREATE OR REPLACE FUNCTION winelio.purge_demo_network(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_earned  numeric;
  v_pending numeric;
BEGIN
  -- Calcul des montants demo avant suppression (pour recalcul wallet)
  SELECT COALESCE(SUM(amount), 0) INTO v_earned
  FROM winelio.commission_transactions
  WHERE user_id = p_user_id AND status = 'EARNED' AND is_demo = true;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM winelio.commission_transactions
  WHERE user_id = p_user_id AND status = 'PENDING' AND is_demo = true;

  -- 1. Commissions liées aux recos demo du réseau
  DELETE FROM winelio.commission_transactions
  WHERE is_demo = true
    AND recommendation_id IN (
      SELECT id FROM winelio.recommendations
      WHERE is_demo = true
        AND referrer_id IN (
          SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id
        )
    );

  -- 1b. Commissions liées aux recos propres de l'utilisateur (referrer = p_user_id)
  DELETE FROM winelio.commission_transactions
  WHERE is_demo = true
    AND recommendation_id IN (
      SELECT id FROM winelio.recommendations
      WHERE is_demo = true AND referrer_id = p_user_id
    );

  -- 2. Commissions is_demo du vrai user (réseau)
  DELETE FROM winelio.commission_transactions
  WHERE user_id = p_user_id AND is_demo = true;

  -- 3. Recommandations demo du réseau
  DELETE FROM winelio.recommendations
  WHERE is_demo = true
    AND referrer_id IN (
      SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id
    );

  -- 3b. Recommandations propres de l'utilisateur (demo)
  DELETE FROM winelio.recommendations
  WHERE is_demo = true AND referrer_id = p_user_id;

  -- 4. Entreprises des profils demo
  DELETE FROM winelio.companies
  WHERE owner_id IN (SELECT id FROM winelio.profiles WHERE demo_owner_id = p_user_id);

  -- 5. Profils demo
  DELETE FROM winelio.profiles WHERE demo_owner_id = p_user_id;

  -- 6. Recalcul wallet (available inclus)
  UPDATE winelio.user_wallet_summaries SET
    total_earned        = GREATEST(0, total_earned - v_earned),
    available           = GREATEST(0, available    - v_earned),
    pending_commissions = GREATEST(0, pending_commissions - v_pending)
  WHERE user_id = p_user_id;
END;
$$;
