-- À exécuter après la migration, dans une transaction annulée : aucun compte persisté.
BEGIN;
CREATE FUNCTION pg_temp.check_signup(metadata jsonb, succeeds boolean)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  test_id uuid := gen_random_uuid();
  actual_sponsor uuid;
BEGIN
  BEGIN
    INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000', test_id, 'authenticated', 'authenticated',
      'sponsor-policy-' || test_id || '@winelio-e2e.local', '{"provider":"email","providers":["email"]}', metadata, now(), now());
    IF NOT succeeds THEN RAISE EXCEPTION 'Inscription sans code valide acceptée'; END IF;
    SELECT sponsor_id INTO actual_sponsor FROM winelio.profiles WHERE id = test_id;
    IF actual_sponsor IS DISTINCT FROM (
      SELECT id FROM winelio.profiles WHERE sponsor_code = upper(btrim(metadata->>'sponsor_code'))
    ) THEN RAISE EXCEPTION 'Le parrain ne correspond pas au code fourni'; END IF;
    IF NOT EXISTS (SELECT 1 FROM winelio.user_wallet_summaries WHERE user_id = test_id) THEN
      RAISE EXCEPTION 'Wallet absent après inscription valide';
    END IF;
    -- Nettoyage en sous-transaction, même pour le scénario accepté.
    RAISE EXCEPTION USING ERRCODE = 'Z0001', MESSAGE = 'rollback test';
  EXCEPTION
    WHEN check_violation THEN
      IF succeeds OR SQLERRM NOT ILIKE '%parrainage%' THEN RAISE; END IF;
    WHEN SQLSTATE 'Z0001' THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = test_id)
     OR EXISTS (SELECT 1 FROM winelio.profiles WHERE id = test_id)
     OR EXISTS (SELECT 1 FROM winelio.user_wallet_summaries WHERE user_id = test_id) THEN
    RAISE EXCEPTION 'Résidu du scénario de test';
  END IF;
END;
$$;
DO $$
DECLARE
  metadata jsonb := '{"app":"winelio","first_name":"Test","last_name":"Sponsor","phone":"+33699887766"}';
  sponsor_code text;
BEGIN
  SELECT p.sponsor_code INTO STRICT sponsor_code FROM winelio.profiles p
  WHERE p.is_founder = true AND p.is_active = true LIMIT 1;
  PERFORM pg_temp.check_signup(metadata, false);
  PERFORM pg_temp.check_signup(metadata || '{"sponsor_code":"   "}', false);
  PERFORM pg_temp.check_signup(metadata || '{"sponsor_id":"00000000-0000-4000-8000-000000000001"}', false);
  PERFORM pg_temp.check_signup(metadata || '{"sponsor_code":"INVALID-SPONSOR-CODE"}', false);
  PERFORM pg_temp.check_signup(metadata || '{"scraped":true}', false);
  PERFORM pg_temp.check_signup(metadata || jsonb_build_object('sponsor_code', '  ' || lower(sponsor_code) || '  ',
    'sponsor_id', '00000000-0000-4000-8000-000000000001'), true);
  -- GoTrue sans marqueur Winelio, puis tentative directe d’entrée dans le réseau.
  DECLARE outsider uuid := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (outsider, 'sponsor-policy-' || outsider || '@winelio-e2e.local', '{}');
    BEGIN
      INSERT INTO winelio.profiles(id, email) VALUES (outsider, 'sponsor-policy-' || outsider || '@winelio-e2e.local');
      RAISE EXCEPTION 'Insertion directe sans code acceptée';
    EXCEPTION WHEN check_violation THEN
      IF SQLERRM NOT ILIKE '%parrainage%' THEN RAISE; END IF;
    END;
  END;
  RAISE NOTICE '7 scénarios inscription vérifiés, transaction annulée';
END;
$$;
ROLLBACK;
