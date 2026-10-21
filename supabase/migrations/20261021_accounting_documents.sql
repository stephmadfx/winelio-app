BEGIN;

-- Les émetteurs sont versionnés : activer une nouvelle société ne réécrit rien.
CREATE TABLE winelio.accounting_issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  address text NOT NULL,
  postal_code text NOT NULL,
  city text NOT NULL,
  rcs text NOT NULL,
  siren text NOT NULL,
  siret text NOT NULL,
  naf_code text NOT NULL,
  vat_number text NOT NULL,
  vat_rate numeric NOT NULL DEFAULT 20 CHECK (vat_rate >= 0),
  operator_description text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounting_one_active_issuer ON winelio.accounting_issuers (active) WHERE active;
INSERT INTO winelio.accounting_issuers
  (legal_name,address,postal_code,city,rcs,siren,siret,naf_code,vat_number,operator_description,active)
VALUES ('EXASUD','133 rue des Thons','11100','NARBONNE','NARBONNE','422432864',
  '42243286400029','7022Z','FR06422432864','Société exploitant provisoirement la plateforme WINELIO',true);

CREATE TABLE winelio.accounting_document_counters (
  kind text NOT NULL CHECK (kind IN ('invoice','payout')),
  year integer NOT NULL,
  is_demo boolean NOT NULL,
  last_number integer NOT NULL CHECK (last_number > 0),
  PRIMARY KEY (kind,year,is_demo)
);
CREATE TABLE winelio.accounting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('invoice','payout')),
  number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL,
  event_at timestamptz NOT NULL,
  -- Pas de FK cascade : les pièces comptables survivent à la suppression du compte.
  owner_id uuid NOT NULL,
  source_id uuid NOT NULL,
  recommendation_id uuid,
  issuer jsonb NOT NULL,
  recipient jsonb NOT NULL,
  amounts jsonb NOT NULL,
  details jsonb NOT NULL,
  template_version integer NOT NULL DEFAULT 1 CHECK (template_version = 1),
  is_demo boolean NOT NULL DEFAULT false,
  UNIQUE (kind,source_id)
);
CREATE INDEX accounting_documents_owner_date ON winelio.accounting_documents (owner_id,issued_at DESC);
CREATE UNIQUE INDEX accounting_one_invoice_per_recommendation ON winelio.accounting_documents (recommendation_id) WHERE kind='invoice';
CREATE TABLE winelio.accounting_document_files (
  document_id uuid PRIMARY KEY REFERENCES winelio.accounting_documents(id) ON DELETE CASCADE,
  pdf_base64 text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE winelio.accounting_issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.accounting_document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.accounting_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE winelio.accounting_document_files ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON winelio.accounting_issuers,winelio.accounting_documents TO authenticated;
GRANT ALL ON winelio.accounting_issuers,winelio.accounting_document_counters,
  winelio.accounting_documents,winelio.accounting_document_files TO service_role;
CREATE POLICY accounting_issuer_read ON winelio.accounting_issuers FOR SELECT TO authenticated USING (true);
CREATE POLICY accounting_document_read ON winelio.accounting_documents FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR auth.jwt()->'app_metadata'->>'role' = 'super_admin');

CREATE FUNCTION winelio.protect_accounting_document() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Les seules suppressions autorisées sont celles des pièces de démonstration/test.
  IF TG_OP = 'DELETE' AND OLD.is_demo THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Un document comptable émis est immuable';
END;
$$;
CREATE TRIGGER protect_accounting_document BEFORE UPDATE OR DELETE ON winelio.accounting_documents
  FOR EACH ROW EXECUTE FUNCTION winelio.protect_accounting_document();
CREATE FUNCTION winelio.protect_accounting_file() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM winelio.accounting_documents WHERE id = OLD.document_id AND NOT is_demo
  ) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Le PDF comptable archivé est immuable';
END;
$$;
CREATE TRIGGER protect_accounting_file BEFORE UPDATE OR DELETE ON winelio.accounting_document_files
  FOR EACH ROW EXECUTE FUNCTION winelio.protect_accounting_file();

ALTER TABLE winelio.withdrawals ADD COLUMN balance_before numeric;
ALTER TABLE winelio.withdrawals ADD COLUMN balance_after numeric;
CREATE FUNCTION winelio.snapshot_withdrawal_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  SELECT available INTO NEW.balance_before FROM winelio.user_wallet_summaries
    WHERE user_id = NEW.user_id FOR UPDATE;
  NEW.balance_after := NEW.balance_before - NEW.amount;
  RETURN NEW;
END;
$$;
CREATE TRIGGER snapshot_withdrawal_balance BEFORE INSERT ON winelio.withdrawals
  FOR EACH ROW EXECUTE FUNCTION winelio.snapshot_withdrawal_balance();

CREATE FUNCTION winelio.issue_accounting_document(p_kind text,p_source_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_document_id uuid;
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
  SELECT id INTO v_document_id FROM winelio.accounting_documents WHERE kind=p_kind AND source_id=p_source_id;
  IF FOUND THEN RETURN v_document_id; END IF;

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
  SELECT to_jsonb(i)-'active',vat_rate INTO STRICT v_issuer,v_vat_rate FROM winelio.accounting_issuers i WHERE active FOR SHARE;
  v_recipient := jsonb_build_object('name',
    CASE WHEN p_kind='invoice' THEN coalesce(nullif(v_company.legal_name,''),nullif(v_company.name,''),concat_ws(' ',v_profile.first_name,v_profile.last_name))
      ELSE concat_ws(' ',v_profile.first_name,v_profile.last_name) END,
    'address',coalesce(nullif(v_company.address,''),v_profile.address),
    'postal_code',coalesce(nullif(v_company.postal_code,''),v_profile.postal_code),
    'city',coalesce(nullif(v_company.city,''),v_profile.city),
    'country',coalesce(v_company.country,v_profile.country,'FR'),
    'siret',v_company.siret,'vat_number',v_company.vat_number,'email',v_profile.email,
    'is_professional',coalesce(v_profile.is_professional,false));
  IF p_kind='invoice' THEN
    v_net := round(v_total / (1 + v_vat_rate/100),2);
    v_amounts := jsonb_build_object('total_ttc',v_total,'total_ht',v_net,'vat',v_total-v_net,'vat_rate',v_vat_rate);
  ELSE
    v_amounts := jsonb_build_object('withdrawn',v_total,'fees',coalesce(v_withdrawal.fee_amount,0),
      'paid',v_total-coalesce(v_withdrawal.fee_amount,0));
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
  INSERT INTO winelio.accounting_documents
    (kind,number,issued_at,event_at,owner_id,source_id,recommendation_id,issuer,recipient,amounts,details,is_demo)
    VALUES(p_kind,(CASE WHEN v_demo THEN 'TEST-' ELSE '' END) ||
      (CASE WHEN p_kind='invoice' THEN 'FAC-' ELSE 'ATT-' END) || v_year || '-' ||
      lpad(v_number::text,greatest(4,length(v_number::text)),'0'),v_issued_at,v_event_at,v_owner,p_source_id,
      v_recommendation,v_issuer,v_recipient,v_amounts,v_details,v_demo)
    RETURNING id INTO v_document_id;
  RETURN v_document_id;
END;
$$;
REVOKE ALL ON FUNCTION winelio.issue_accounting_document(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION winelio.issue_accounting_document(text,uuid) TO service_role;

CREATE FUNCTION winelio.issue_payment_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status='paid' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM winelio.issue_accounting_document('invoice',NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue_payment_invoice AFTER INSERT OR UPDATE OF status ON winelio.stripe_payment_sessions
  FOR EACH ROW EXECUTE FUNCTION winelio.issue_payment_invoice();
CREATE FUNCTION winelio.issue_withdrawal_attestation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status='COMPLETED' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM winelio.issue_accounting_document('payout',NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER issue_withdrawal_attestation AFTER INSERT OR UPDATE OF status ON winelio.withdrawals
  FOR EACH ROW EXECUTE FUNCTION winelio.issue_withdrawal_attestation();

-- Pas de rétrofacturation automatique des anciens paiements : émetteur et pièces existantes à contrôler.
NOTIFY pgrst, 'reload schema';
COMMIT;
