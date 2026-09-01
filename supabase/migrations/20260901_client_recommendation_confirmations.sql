-- Le client final valide désormais lui-même le devis et la bonne réalisation.
-- Les liens sont signés côté application, versionnés et révocables.

BEGIN;

ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS client_quote_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS client_quote_token_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_quote_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_quote_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_quote_note text,
  ADD COLUMN IF NOT EXISTS client_completion_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS client_completion_token_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_completion_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_completion_responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_completion_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'winelio.recommendations'::regclass
      AND conname = 'recommendations_client_quote_status_check'
  ) THEN
    ALTER TABLE winelio.recommendations
      ADD CONSTRAINT recommendations_client_quote_status_check
      CHECK (client_quote_status IN ('not_requested', 'pending', 'accepted', 'disputed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'winelio.recommendations'::regclass
      AND conname = 'recommendations_client_completion_status_check'
  ) THEN
    ALTER TABLE winelio.recommendations
      ADD CONSTRAINT recommendations_client_completion_status_check
      CHECK (client_completion_status IN ('not_requested', 'pending', 'confirmed', 'disputed'));
  END IF;
END $$;

-- Prépare ou réutilise une demande en attente. Une relance conserve ainsi le
-- même token et la même clé de déduplication tant que le lien reste valide.
CREATE OR REPLACE FUNCTION winelio.prepare_client_recommendation_action(
  p_recommendation_id uuid,
  p_purpose text,
  p_expires_at timestamptz
)
RETURNS TABLE(token_version integer, token_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $function$
DECLARE
  rec winelio.recommendations%ROWTYPE;
BEGIN
  IF p_purpose NOT IN ('quote', 'completion') THEN
    RAISE EXCEPTION 'invalid_purpose';
  END IF;
  IF p_expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_expiry';
  END IF;

  SELECT * INTO rec
  FROM winelio.recommendations
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_found';
  END IF;

  IF p_purpose = 'quote' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM winelio.recommendation_steps rs
      JOIN winelio.steps s ON s.id = rs.step_id
      WHERE rs.recommendation_id = rec.id AND s.order_index = 5 AND rs.completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'quote_not_submitted';
    END IF;
    IF rec.client_quote_status = 'accepted' THEN
      RAISE EXCEPTION 'already_accepted';
    END IF;

    IF rec.client_quote_status = 'pending'
       AND rec.client_quote_token_expires_at > now() + interval '1 hour' THEN
      RETURN QUERY SELECT rec.client_quote_token_version, rec.client_quote_token_expires_at;
      RETURN;
    END IF;

    UPDATE winelio.recommendations
    SET client_quote_status = 'pending',
        client_quote_token_version = client_quote_token_version + 1,
        client_quote_token_expires_at = p_expires_at,
        client_quote_responded_at = NULL,
        client_quote_note = NULL,
        updated_at = now()
    WHERE id = rec.id
    RETURNING client_quote_token_version, client_quote_token_expires_at
      INTO token_version, token_expires_at;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM winelio.recommendation_steps rs
      JOIN winelio.steps s ON s.id = rs.step_id
      WHERE rs.recommendation_id = rec.id AND s.order_index = 7 AND rs.completed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'work_not_declared_complete';
    END IF;
    IF rec.client_completion_status = 'confirmed' THEN
      RAISE EXCEPTION 'already_confirmed';
    END IF;

    IF rec.client_completion_status = 'pending'
       AND rec.client_completion_token_expires_at > now() + interval '1 hour' THEN
      RETURN QUERY SELECT rec.client_completion_token_version, rec.client_completion_token_expires_at;
      RETURN;
    END IF;

    UPDATE winelio.recommendations
    SET client_completion_status = 'pending',
        client_completion_token_version = client_completion_token_version + 1,
        client_completion_token_expires_at = p_expires_at,
        client_completion_responded_at = NULL,
        client_completion_note = NULL,
        updated_at = now()
    WHERE id = rec.id
    RETURNING client_completion_token_version, client_completion_token_expires_at
      INTO token_version, token_expires_at;
  END IF;

  RETURN NEXT;
END
$function$;

-- Applique une réponse client sous verrou. Les mises à jour de l'étape et de la
-- recommandation sont atomiques et les doubles clics deviennent idempotents.
CREATE OR REPLACE FUNCTION winelio.apply_client_recommendation_action(
  p_recommendation_id uuid,
  p_purpose text,
  p_token_version integer,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $function$
DECLARE
  rec winelio.recommendations%ROWTYPE;
  step_row_id uuid;
  now_at timestamptz := now();
  clean_note text := NULLIF(left(trim(COALESCE(p_note, '')), 1000), '');
BEGIN
  IF p_purpose NOT IN ('quote', 'completion') THEN
    RAISE EXCEPTION 'invalid_purpose';
  END IF;
  IF p_decision NOT IN ('confirm', 'dispute') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;
  IF p_decision = 'dispute' AND clean_note IS NULL THEN
    RAISE EXCEPTION 'note_required';
  END IF;

  SELECT * INTO rec
  FROM winelio.recommendations
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'recommendation_not_found';
  END IF;

  IF p_purpose = 'quote' THEN
    IF rec.client_quote_status = 'accepted' THEN
      RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'accepted');
    END IF;
    IF rec.client_quote_token_version <> p_token_version
       OR rec.client_quote_status <> 'pending'
       OR rec.client_quote_token_expires_at < now_at THEN
      RAISE EXCEPTION 'invalid_or_expired_token';
    END IF;

    IF p_decision = 'dispute' THEN
      UPDATE winelio.recommendations
      SET client_quote_status = 'disputed',
          client_quote_responded_at = now_at,
          client_quote_note = clean_note,
          client_quote_token_version = client_quote_token_version + 1,
          updated_at = now_at
      WHERE id = rec.id;
      RETURN jsonb_build_object('ok', true, 'status', 'disputed');
    END IF;

    SELECT rs.id INTO step_row_id
    FROM winelio.recommendation_steps rs
    JOIN winelio.steps s ON s.id = rs.step_id
    WHERE rs.recommendation_id = rec.id AND s.order_index = 6
    FOR UPDATE OF rs;

    IF step_row_id IS NULL THEN
      RAISE EXCEPTION 'client_quote_step_not_found';
    END IF;

    UPDATE winelio.recommendation_steps
    SET completed_at = COALESCE(completed_at, now_at),
        data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
          'confirmation_client', true,
          'confirmee_le', now_at
        )
    WHERE id = step_row_id;

    UPDATE winelio.recommendations
    SET status = 'QUOTE_VALIDATED',
        validation_date = COALESCE(validation_date, now_at),
        client_quote_status = 'accepted',
        client_quote_responded_at = now_at,
        client_quote_note = clean_note,
        client_quote_token_version = client_quote_token_version + 1,
        updated_at = now_at
    WHERE id = rec.id;

    RETURN jsonb_build_object('ok', true, 'status', 'accepted');
  END IF;

  IF rec.client_completion_status = 'confirmed' THEN
    RETURN jsonb_build_object('ok', true, 'already_processed', true, 'status', 'confirmed');
  END IF;
  IF rec.client_completion_token_version <> p_token_version
     OR rec.client_completion_status <> 'pending'
     OR rec.client_completion_token_expires_at < now_at THEN
    RAISE EXCEPTION 'invalid_or_expired_token';
  END IF;

  IF p_decision = 'dispute' THEN
    UPDATE winelio.recommendations
    SET client_completion_status = 'disputed',
        client_completion_responded_at = now_at,
        client_completion_note = clean_note,
        client_completion_token_version = client_completion_token_version + 1,
        updated_at = now_at
    WHERE id = rec.id;
    RETURN jsonb_build_object('ok', true, 'status', 'disputed');
  END IF;

  SELECT rs.id INTO step_row_id
  FROM winelio.recommendation_steps rs
  JOIN winelio.steps s ON s.id = rs.step_id
  WHERE rs.recommendation_id = rec.id AND s.order_index = 8
  FOR UPDATE OF rs;

  IF step_row_id IS NULL THEN
    RAISE EXCEPTION 'client_completion_step_not_found';
  END IF;

  UPDATE winelio.recommendation_steps
  SET completed_at = COALESCE(completed_at, now_at),
      data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
        'confirmation_client', true,
        'confirmee_le', now_at
      )
  WHERE id = step_row_id;

  UPDATE winelio.recommendations
  SET status = 'COMPLETED',
      client_completion_status = 'confirmed',
      client_completion_responded_at = now_at,
      client_completion_note = clean_note,
      client_completion_token_version = client_completion_token_version + 1,
      updated_at = now_at
  WHERE id = rec.id;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END
$function$;

REVOKE ALL ON FUNCTION winelio.prepare_client_recommendation_action(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION winelio.apply_client_recommendation_action(uuid, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.prepare_client_recommendation_action(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION winelio.apply_client_recommendation_action(uuid, text, integer, text, text) TO service_role;

COMMIT;
