-- ============================================================
-- Winelio — Ajout du flag is_founder sur winelio.profiles
-- et mise à jour de la fonction de rotation pour utiliser
-- uniquement les fondateurs désignés.
-- ============================================================

-- 1. Colonne is_founder (schéma winelio)
ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

-- 2. Table d'état de rotation (idempotente, déjà créée par 009)
CREATE TABLE IF NOT EXISTS public.registration_rotation_state (
    name text PRIMARY KEY,
    next_index integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.registration_rotation_state (name, next_index)
VALUES ('open_registration', 0)
ON CONFLICT (name) DO NOTHING;

-- 3. Fonction round-robin sur les fondateurs (schéma winelio)
CREATE OR REPLACE FUNCTION public.get_next_open_registration_sponsor(
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, winelio
AS $$
DECLARE
  v_candidates uuid[];
  v_count      integer;
  v_current    integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at ASC)
    INTO v_candidates
  FROM winelio.profiles
  WHERE is_founder = true
    AND (p_exclude_user_id IS NULL OR id <> p_exclude_user_id);

  v_count := COALESCE(array_length(v_candidates, 1), 0);
  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  SELECT next_index
    INTO v_current
  FROM public.registration_rotation_state
  WHERE name = 'open_registration'
  FOR UPDATE;

  v_current := COALESCE(v_current, 0);

  UPDATE public.registration_rotation_state
  SET next_index = v_current + 1,
      updated_at = now()
  WHERE name = 'open_registration';

  RETURN v_candidates[(v_current % v_count) + 1];
END;
$$;

-- 4. Désigner contact@aide-multimedia.fr comme fondateur
UPDATE winelio.profiles
SET is_founder = true
WHERE email = 'contact@aide-multimedia.fr';
