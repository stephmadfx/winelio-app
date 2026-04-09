-- ============================================================
-- Open registration rotation
-- Assigne les comptes sans code parrain à une des 3 têtes
-- de lignée actives, en rotation séquentielle.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registration_rotation_state (
    name text PRIMARY KEY,
    next_index integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.registration_rotation_state (name, next_index)
VALUES ('open_registration', 0)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_next_open_registration_sponsor(p_exclude_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates uuid[];
  v_count integer;
  v_current_index integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at ASC)
    INTO v_candidates
  FROM (
    SELECT id, created_at
    FROM public.profiles
    WHERE is_active = true
      AND sponsor_id IS NULL
      AND (p_exclude_user_id IS NULL OR id <> p_exclude_user_id)
    ORDER BY created_at ASC
    LIMIT 3
  ) roots;

  v_count := COALESCE(array_length(v_candidates, 1), 0);
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.registration_rotation_state (name, next_index)
  VALUES ('open_registration', 0)
  ON CONFLICT (name) DO NOTHING;

  SELECT next_index
    INTO v_current_index
  FROM public.registration_rotation_state
  WHERE name = 'open_registration'
  FOR UPDATE;

  v_current_index := COALESCE(v_current_index, 0);

  UPDATE public.registration_rotation_state
  SET next_index = v_current_index + 1,
      updated_at = now()
  WHERE name = 'open_registration';

  RETURN v_candidates[(v_current_index % v_count) + 1];
END;
$$;
