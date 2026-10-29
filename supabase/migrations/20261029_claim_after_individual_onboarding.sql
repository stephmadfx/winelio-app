-- Only the server can merge a referenced company after verified claim access.
CREATE OR REPLACE FUNCTION winelio.finalize_professional_claim(
  p_recommendation_id uuid, p_user_id uuid, p_expected_professional_id uuid,
  p_source_company_id uuid, p_destination_company_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = winelio, public AS $$
DECLARE
  source_company winelio.companies%ROWTYPE;
  destination_company winelio.companies%ROWTYPE;
  recipient winelio.profiles%ROWTYPE;
  current_professional uuid;
BEGIN
  -- All recommendations of the same imported company serialize on this lock.
  SELECT * INTO source_company FROM winelio.companies WHERE id=p_source_company_id FOR UPDATE;
  SELECT professional_id INTO current_professional FROM winelio.recommendations WHERE id=p_recommendation_id FOR UPDATE;
  IF current_professional IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF current_professional=p_user_id THEN RETURN jsonb_build_object('alreadyClaimed',true); END IF;
  IF current_professional<>p_expected_professional_id OR source_company.id IS NULL
    OR source_company.owner_id<>p_expected_professional_id OR source_company.source IS DISTINCT FROM 'scraped'
    OR source_company.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('error','conflict'); END IF;
  IF (SELECT count(*) FROM winelio.companies WHERE owner_id=p_expected_professional_id AND deleted_at IS NULL)<>1
    THEN RETURN jsonb_build_object('error','ambiguous'); END IF;
  SELECT * INTO recipient FROM winelio.profiles WHERE id=p_user_id FOR UPDATE;
  SELECT * INTO destination_company FROM winelio.companies WHERE id=p_destination_company_id FOR UPDATE;
  IF recipient.is_active IS DISTINCT FROM true OR recipient.is_professional IS DISTINCT FROM true OR recipient.pro_engagement_accepted IS DISTINCT FROM true
    OR destination_company.id IS NULL OR destination_company.owner_id<>p_user_id
    OR destination_company.deleted_at IS NOT NULL OR coalesce(destination_company.source,'owner')<>'owner'
    OR coalesce(destination_company.siret,'') !~ '^[0-9]{14}$' OR coalesce(destination_company.insurance_number,'')=''
    THEN RETURN jsonb_build_object('error','onboarding_required'); END IF;
  IF source_company.siret IS NOT NULL AND length(source_company.siret)>=9
    AND left(source_company.siret,9)<>left(destination_company.siret,9)
    THEN RETURN jsonb_build_object('error','company_mismatch'); END IF;
  -- Keep all leads of this one referenced company accessible, and hide the duplicate
  -- imported listing. No sponsor, money movement or historical payment is rewritten.
  UPDATE winelio.recommendations SET professional_id=p_user_id WHERE professional_id=p_expected_professional_id;
  UPDATE winelio.companies SET deleted_at=now() WHERE id=p_source_company_id;
  RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION winelio.finalize_professional_claim(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.finalize_professional_claim(uuid,uuid,uuid,uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
