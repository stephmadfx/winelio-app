-- Fenêtre de correction des données professionnelles vérifiées.
-- Une valeur manquante peut toujours être ajoutée. Une valeur d'identité déjà
-- renseignée devient immuable 48 h après la vérification et passe par le support.

ALTER TABLE winelio.companies
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

UPDATE winelio.companies
SET verified_at = COALESCE(created_at, now())
WHERE is_verified = true
  AND verified_at IS NULL;

CREATE OR REPLACE FUNCTION winelio.enforce_company_owner_edit_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_is_owner_request boolean := auth.uid() IS NOT NULL AND auth.uid() = OLD.owner_id;
  v_locked boolean := OLD.is_verified
    AND COALESCE(OLD.verified_at, OLD.created_at) <= now() - interval '48 hours';
BEGIN
  -- Les opérations d'administration (service_role / SQL) ne sont pas concernées.
  IF NOT v_is_owner_request THEN
    IF NEW.is_verified AND NOT OLD.is_verified AND NEW.verified_at IS NULL THEN
      NEW.verified_at := now();
    ELSIF NOT NEW.is_verified THEN
      NEW.verified_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Un propriétaire ne peut pas modifier lui-même l'état de vérification.
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'La vérification de la fiche est réservée au support.';
  END IF;

  IF v_locked THEN
    -- Après 48 h, chaque valeur d'identité existante est figée. Les champs
    -- encore vides restent complétables (une seule fois) par le professionnel.
    IF NULLIF(btrim(COALESCE(OLD.name, '')), '') IS NOT NULL
       AND NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'Le nom existant doit être modifié par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.legal_name, '')), '') IS NOT NULL
       AND NEW.legal_name IS DISTINCT FROM OLD.legal_name THEN
      RAISE EXCEPTION 'La raison sociale existante doit être modifiée par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.address, '')), '') IS NOT NULL
       AND NEW.address IS DISTINCT FROM OLD.address THEN
      RAISE EXCEPTION 'L''adresse existante doit être modifiée par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.city, '')), '') IS NOT NULL
       AND NEW.city IS DISTINCT FROM OLD.city THEN
      RAISE EXCEPTION 'La ville existante doit être modifiée par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.postal_code, '')), '') IS NOT NULL
       AND NEW.postal_code IS DISTINCT FROM OLD.postal_code THEN
      RAISE EXCEPTION 'Le code postal existant doit être modifié par le support.';
    END IF;
    IF OLD.category_id IS NOT NULL AND NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      RAISE EXCEPTION 'La catégorie existante doit être modifiée par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.siret, '')), '') IS NOT NULL
       AND NEW.siret IS DISTINCT FROM OLD.siret THEN
      RAISE EXCEPTION 'Le SIRET existant doit être modifié par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.siren, '')), '') IS NOT NULL
       AND NEW.siren IS DISTINCT FROM OLD.siren THEN
      RAISE EXCEPTION 'Le SIREN existant doit être modifié par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.naf_code, '')), '') IS NOT NULL
       AND NEW.naf_code IS DISTINCT FROM OLD.naf_code THEN
      RAISE EXCEPTION 'Le code NAF existant doit être modifié par le support.';
    END IF;
    IF NULLIF(btrim(COALESCE(OLD.insurance_number, '')), '') IS NOT NULL
       AND NEW.insurance_number IS DISTINCT FROM OLD.insurance_number THEN
      RAISE EXCEPTION 'Le numéro d''assurance existant doit être modifié par le support.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_company_owner_edit_window ON winelio.companies;
CREATE TRIGGER enforce_company_owner_edit_window
  BEFORE UPDATE ON winelio.companies
  FOR EACH ROW
  EXECUTE FUNCTION winelio.enforce_company_owner_edit_window();

CREATE OR REPLACE FUNCTION winelio.audit_company_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_old := to_jsonb(OLD) - ARRAY['updated_at'];
  v_new := to_jsonb(NEW) - ARRAY['updated_at'];

  IF v_old IS DISTINCT FROM v_new THEN
    INSERT INTO winelio.audit_logs
      (user_id, action, entity_type, entity_id, old_value, new_value, success)
    VALUES
      (auth.uid(), 'company_profile_updated', 'company', NEW.id, v_old, v_new, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_company_profile_changes ON winelio.companies;
CREATE TRIGGER audit_company_profile_changes
  AFTER UPDATE ON winelio.companies
  FOR EACH ROW
  EXECUTE FUNCTION winelio.audit_company_profile_changes();

COMMENT ON COLUMN winelio.companies.verified_at IS
  'Début de la fenêtre de correction de 48 h des données d’identité professionnelle.';
