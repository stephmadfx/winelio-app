BEGIN;
-- Une pièce incomplète reste un brouillon non numéroté. L'instantané financier est conservé.
ALTER TABLE winelio.accounting_documents ALTER COLUMN number DROP NOT NULL;
ALTER TABLE winelio.accounting_documents ALTER COLUMN issued_at DROP NOT NULL;
ALTER TABLE winelio.accounting_documents ADD CONSTRAINT accounting_documents_emission_state
  CHECK ((number IS NULL) = (issued_at IS NULL));
CREATE FUNCTION winelio.require_issued_accounting_file() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM winelio.accounting_documents WHERE id=NEW.document_id AND number IS NOT NULL AND issued_at IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Un brouillon ne peut pas être archivé comme PDF officiel'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER require_issued_accounting_file BEFORE INSERT ON winelio.accounting_document_files
  FOR EACH ROW EXECUTE FUNCTION winelio.require_issued_accounting_file();
CREATE OR REPLACE FUNCTION winelio.protect_accounting_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='DELETE' AND OLD.is_demo THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.number IS NULL AND
    (to_jsonb(NEW)-ARRAY['recipient','number','issued_at'])=(to_jsonb(OLD)-ARRAY['recipient','number','issued_at'])
    THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Un document comptable émis est immuable';
END;
$$;

CREATE OR REPLACE FUNCTION winelio.issue_accounting_document(p_kind text,p_source_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_document_id uuid;
  v_previous winelio.accounting_documents%ROWTYPE;
  v_document_number text;
  v_owner uuid;
  v_recommendation uuid;
  v_profile winelio.profiles%ROWTYPE;
  v_company winelio.companies%ROWTYPE;
  v_payment winelio.stripe_payment_sessions%ROWTYPE;
  v_withdrawal winelio.withdrawals%ROWTYPE;
  v_issuer jsonb;
  v_recipient jsonb;
  v_amounts jsonb;
  v_details jsonb;
  v_demo boolean;
  v_event_at timestamptz;
  v_issued_at timestamptz;
  v_number integer;
  v_year integer;
  v_total numeric;
  v_net numeric;
  v_vat_rate numeric;
BEGIN
  IF p_kind NOT IN ('invoice','payout') THEN RAISE EXCEPTION 'Type de document invalide'; END IF;
  -- Même source : sérialiser avant le test d'existence et avant toute numérotation.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_kind || p_source_id::text,0));
  SELECT * INTO v_previous FROM winelio.accounting_documents WHERE kind=p_kind AND source_id=p_source_id;
  IF FOUND AND v_previous.number IS NOT NULL THEN RETURN v_previous.id; END IF;

  IF p_kind = 'invoice' THEN
    SELECT * INTO STRICT v_payment FROM winelio.stripe_payment_sessions WHERE id=p_source_id AND status='paid';
    SELECT professional_id,id,coalesce(is_demo,false) INTO v_owner,v_recommendation,v_demo
      FROM winelio.recommendations WHERE id=v_payment.recommendation_id;
    SELECT c.* INTO v_company FROM winelio.companies c JOIN winelio.recommendations r ON r.company_id=c.id
      WHERE r.id=v_recommendation;
    v_total := v_payment.amount;
    v_event_at := v_payment.paid_at;
    IF v_event_at IS NULL THEN RAISE EXCEPTION 'Date du paiement manquante'; END IF;
    v_details := jsonb_build_object('payment_reference',p_source_id,'payment_method','Carte bancaire (Stripe)',
      'deal_amount_ttc',v_payment.deal_amount,'commission_rate',v_payment.commission_rate,
      'description','Commission d’intermédiation WINELIO','commission_basis','TTC');
  ELSE
    SELECT * INTO STRICT v_withdrawal FROM winelio.withdrawals WHERE id=p_source_id AND status='COMPLETED';
    v_owner := v_withdrawal.user_id;
    v_demo := false;
    v_total := v_withdrawal.amount;
    v_event_at := v_withdrawal.processed_at;
    IF v_event_at IS NULL THEN RAISE EXCEPTION 'Date du versement manquante'; END IF;
    v_details := jsonb_build_object('withdrawal_reference',p_source_id,'payment_method',
      CASE WHEN v_withdrawal.method='bank_transfer' THEN 'Virement bancaire' ELSE v_withdrawal.method END,
      'balance_before',v_withdrawal.balance_before,'balance_after',v_withdrawal.balance_after,
      'balance_date',v_withdrawal.created_at,
      'tax_notice','Les sommes perçues doivent être déclarées selon les modalités fiscales applicables à votre situation. Pour les affiliés particuliers concernés, elles relèvent des BNC non professionnels, à déclarer notamment au moyen du formulaire 2042 C PRO. La société émettrice déclare les commissions versées selon les obligations applicables de l’article 240 du CGI (DAS2).',
      'status_notice','En cas d’activité habituelle ou de versements récurrents ou significatifs, il vous appartient d’adopter un statut professionnel déclaré. Informez la société de tout changement de statut fiscal, social ou professionnel avant tout nouveau versement.');
  END IF;
  SELECT * INTO STRICT v_profile FROM winelio.profiles WHERE id=v_owner;
  v_demo := v_demo OR coalesce(v_profile.is_demo,false);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Montant comptable invalide'; END IF;
  IF v_previous.id IS NOT NULL THEN
    IF v_previous.owner_id <> v_owner THEN RAISE EXCEPTION 'Le propriétaire du paiement a changé'; END IF;
    v_issuer := v_previous.issuer;
    v_vat_rate := (v_issuer->>'vat_rate')::numeric;
  ELSE
    SELECT to_jsonb(i)-'active',vat_rate INTO STRICT v_issuer,v_vat_rate FROM winelio.accounting_issuers i WHERE active FOR SHARE;
  END IF;
  v_recipient := jsonb_build_object('name',
    CASE WHEN p_kind='invoice' THEN coalesce(nullif(v_company.legal_name,''),nullif(v_company.name,''),concat_ws(' ',v_profile.first_name,v_profile.last_name))
      ELSE concat_ws(' ',v_profile.first_name,v_profile.last_name) END,
    'address',CASE WHEN p_kind='invoice' AND v_company.id IS NOT NULL THEN v_company.address ELSE v_profile.address END,
    'postal_code',CASE WHEN p_kind='invoice' AND v_company.id IS NOT NULL THEN v_company.postal_code ELSE v_profile.postal_code END,
    'city',CASE WHEN p_kind='invoice' AND v_company.id IS NOT NULL THEN v_company.city ELSE v_profile.city END,
    'country',CASE WHEN p_kind='invoice' AND v_company.id IS NOT NULL THEN coalesce(v_company.country,'FR') ELSE coalesce(v_profile.country,'FR') END,
    'siret',v_company.siret,'vat_number',v_company.vat_number,'email',v_profile.email,
    'is_professional',coalesce(v_profile.is_professional,false));
  IF p_kind='invoice' THEN
    v_net := round(v_total / (1 + v_vat_rate/100),2);
    v_amounts := jsonb_build_object('total_ttc',v_total,'total_ht',v_net,'vat',v_total-v_net,'vat_rate',v_vat_rate);
  ELSE
    v_amounts := jsonb_build_object('withdrawn',v_total,'fees',coalesce(v_withdrawal.fee_amount,0),
      'paid',v_total-coalesce(v_withdrawal.fee_amount,0));
  END IF;

  IF v_previous.id IS NOT NULL THEN
    v_amounts := v_previous.amounts;
    v_details := v_previous.details;
    v_event_at := v_previous.event_at;
    v_demo := v_previous.is_demo;
  END IF;
  IF nullif(trim(v_recipient->>'name'),'') IS NULL
    OR nullif(trim(v_recipient->>'address'),'') IS NULL
    OR nullif(trim(v_recipient->>'postal_code'),'') IS NULL
    OR nullif(trim(v_recipient->>'city'),'') IS NULL THEN
    IF v_previous.id IS NOT NULL THEN RETURN v_previous.id; END IF;
    INSERT INTO winelio.accounting_documents
      (kind,number,issued_at,event_at,owner_id,source_id,recommendation_id,issuer,recipient,amounts,details,is_demo)
      VALUES(p_kind,NULL,NULL,v_event_at,v_owner,p_source_id,v_recommendation,v_issuer,v_recipient,v_amounts,v_details,v_demo)
      RETURNING id INTO v_document_id;
    RETURN v_document_id;
  END IF;

  -- Le compteur est une ligne transactionnelle (pas une sequence PostgreSQL).
  -- Son verrou impose l'ordre d'émission et son incrément s'annule si l'émission échoue.
  PERFORM pg_advisory_xact_lock(hashtextextended('accounting-series-' || p_kind || v_demo::text,0));
  v_issued_at := clock_timestamp();
  v_year := extract(year FROM v_issued_at AT TIME ZONE 'Europe/Paris');
  INSERT INTO winelio.accounting_document_counters (kind,year,is_demo,last_number)
    VALUES(p_kind,v_year,v_demo,1)
    ON CONFLICT (kind,year,is_demo) DO UPDATE SET last_number=accounting_document_counters.last_number+1
    RETURNING last_number INTO v_number;
  v_issued_at := clock_timestamp();
  v_document_number := (CASE WHEN v_demo THEN 'TEST-' ELSE '' END) ||
    (CASE WHEN p_kind='invoice' THEN 'FAC-' ELSE 'ATT-' END) || v_year || '-' ||
    lpad(v_number::text,greatest(4,length(v_number::text)),'0');
  IF v_previous.id IS NOT NULL THEN
    UPDATE winelio.accounting_documents SET number=v_document_number,issued_at=v_issued_at,recipient=v_recipient
      WHERE id=v_previous.id AND number IS NULL RETURNING id INTO v_document_id;
    RETURN v_document_id;
  END IF;
  INSERT INTO winelio.accounting_documents
    (kind,number,issued_at,event_at,owner_id,source_id,recommendation_id,issuer,recipient,amounts,details,is_demo)
    VALUES(p_kind,v_document_number,v_issued_at,v_event_at,v_owner,p_source_id,
      v_recommendation,v_issuer,v_recipient,v_amounts,v_details,v_demo)
    RETURNING id INTO v_document_id;
  RETURN v_document_id;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
