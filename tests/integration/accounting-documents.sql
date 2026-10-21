-- Exécuter dans une transaction, puis ROLLBACK, jamais COMMIT : zéro donnée de test persistée.
CREATE TEMP TABLE accounting_test_context (owner_id uuid,other_id uuid,document_id uuid);
GRANT SELECT ON accounting_test_context TO authenticated;
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_company uuid := gen_random_uuid();
  v_reco uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_withdrawal uuid := gen_random_uuid();
  v_document uuid;
  v_snapshot jsonb;
  v_old_issuer uuid;
  v_new_issuer uuid;
  v_count integer;
  v_before integer;
BEGIN
  INSERT INTO winelio.profiles(id,email,phone,first_name,last_name,address,postal_code,city,is_demo,sponsor_code)
    VALUES(v_owner,'accounting-owner@winelio-e2e.local','07'||(10000000+floor(random()*89999999))::text,'Affilié','Comptable','1 rue Test','75001','Paris',true,'AC'||substr(md5(v_owner::text),1,4)),
          (v_other,'accounting-other@winelio-e2e.local','07'||(10000000+floor(random()*89999999))::text,'Autre','Compte','2 rue Test','75002','Paris',true,'AC'||substr(md5(v_other::text),1,4));
  INSERT INTO winelio.user_wallet_summaries(user_id,available,total_earned) VALUES(v_owner,300,300);
  INSERT INTO winelio.companies(id,owner_id,name,legal_name,alias,address,postal_code,city)
    VALUES(v_company,v_owner,'Entreprise Test','Société Test',substr(md5(v_company::text),1,7),'3 rue Société','75003','Paris');
  INSERT INTO winelio.recommendations(id,referrer_id,professional_id,company_id,is_demo,amount)
    VALUES(v_reco,v_other,v_owner,v_company,true,1000);
  INSERT INTO winelio.stripe_payment_sessions(id,recommendation_id,stripe_session_id,amount,deal_amount,commission_rate,status)
    VALUES(v_payment,v_reco,'accounting-test-'||v_payment,100,1000,10,'pending');
  ASSERT NOT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE source_id=v_payment),'Pas de facture pour un paiement non encaissé';
  UPDATE winelio.stripe_payment_sessions SET status='paid',paid_at=now() WHERE id=v_payment;
  SELECT id,to_jsonb(d) INTO v_document,v_snapshot FROM winelio.accounting_documents d WHERE source_id=v_payment;
  ASSERT v_document IS NOT NULL,'Facture automatique';
  ASSERT (v_snapshot->'amounts'->>'total_ttc')::numeric=100,'TTC inchangé';
  ASSERT (v_snapshot->'amounts'->>'total_ht')::numeric=83.33,'HT arrondi';
  ASSERT (v_snapshot->'amounts'->>'vat')::numeric=16.67,'TVA incluse';
  ASSERT v_snapshot->'details'->>'commission_basis'='TTC','Répartition sur le TTC';
  ASSERT v_snapshot->>'number' ~ '^TEST-FAC-[0-9]{4}-[0-9]{4,}$','Série test distincte';
  ASSERT winelio.issue_accounting_document('invoice',v_payment)=v_document,'Idempotence';
  SELECT count(*) INTO v_count FROM winelio.accounting_documents WHERE source_id=v_payment;
  ASSERT v_count=1,'Aucun doublon';
  BEGIN
    UPDATE winelio.accounting_documents SET recipient='{}' WHERE id=v_document;
    RAISE EXCEPTION 'Modification historique autorisée à tort';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%immuable%' THEN RAISE; END IF;
  END;
  UPDATE winelio.companies SET address='Adresse modifiée' WHERE id=v_company;
  SELECT id INTO v_old_issuer FROM winelio.accounting_issuers WHERE active;
  UPDATE winelio.accounting_issuers SET active=false WHERE id=v_old_issuer;
  INSERT INTO winelio.accounting_issuers(legal_name,address,postal_code,city,rcs,siren,siret,naf_code,vat_number,operator_description,active)
    SELECT 'SOCIÉTÉ TEST FUTURE',address,postal_code,city,rcs,siren,siret,naf_code,vat_number,'Émetteur futur de test',true
    FROM winelio.accounting_issuers WHERE id=v_old_issuer RETURNING id INTO v_new_issuer;
  ASSERT (SELECT to_jsonb(d)=v_snapshot FROM winelio.accounting_documents d WHERE id=v_document),'Émetteur et coordonnées historiques figés';

  PERFORM winelio.process_withdrawal(v_owner,25,'bank_transfer','{}',0.25);
  SELECT id INTO v_withdrawal FROM winelio.withdrawals WHERE user_id=v_owner ORDER BY created_at DESC LIMIT 1;
  ASSERT NOT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE source_id=v_withdrawal),'Pas d’attestation en attente';
  UPDATE winelio.withdrawals SET status='PROCESSING' WHERE id=v_withdrawal;
  ASSERT NOT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE source_id=v_withdrawal),'Pas d’attestation en traitement';
  UPDATE winelio.withdrawals SET status='COMPLETED',processed_at=now() WHERE id=v_withdrawal;
  ASSERT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE source_id=v_withdrawal
    AND (amounts->>'paid')::numeric=24.75 AND (amounts->>'withdrawn')::numeric=25
    AND (details->>'balance_before')::numeric=300 AND (details->>'balance_after')::numeric=275
    AND issuer->>'legal_name'='SOCIÉTÉ TEST FUTURE'),'Attestation : net, frais, soldes et nouvel émetteur';
  PERFORM winelio.issue_accounting_document('payout',v_withdrawal);
  ASSERT (SELECT count(*)=1 FROM winelio.accounting_documents WHERE source_id=v_withdrawal),'Attestation idempotente';

  SELECT last_number INTO v_before FROM winelio.accounting_document_counters
    WHERE kind='payout' AND year=extract(year FROM now() AT TIME ZONE 'Europe/Paris') AND is_demo;
  BEGIN
    UPDATE winelio.accounting_document_counters SET last_number=last_number+1
      WHERE kind='payout' AND year=extract(year FROM now() AT TIME ZONE 'Europe/Paris') AND is_demo;
    RAISE EXCEPTION 'annulation simulée';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  ASSERT (SELECT last_number=v_before FROM winelio.accounting_document_counters
    WHERE kind='payout' AND year=extract(year FROM now() AT TIME ZONE 'Europe/Paris') AND is_demo),'Numérotation sans trou après rollback';

  -- Le document réel ne peut pas être supprimé, même par service_role.
  UPDATE winelio.profiles SET is_demo=false WHERE id=v_owner;
  INSERT INTO winelio.withdrawals(user_id,amount,fee_amount,method,status,processed_at)
    VALUES(v_owner,50,0,'bank_transfer','COMPLETED',now()) RETURNING id INTO v_withdrawal;
  BEGIN
    DELETE FROM winelio.accounting_documents WHERE source_id=v_withdrawal;
    RAISE EXCEPTION 'Suppression historique autorisée à tort';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%immuable%' THEN RAISE; END IF;
  END;
  INSERT INTO accounting_test_context VALUES(v_owner,v_other,v_document);
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',(SELECT other_id FROM accounting_test_context),'role','authenticated')::text,true) IS NOT NULL AS session_configured;
DO $$ BEGIN
  ASSERT NOT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE id=(SELECT document_id FROM accounting_test_context)),'RLS : document tiers invisible';
  ASSERT NOT EXISTS(SELECT 1 FROM winelio.wallet_movements WHERE user_id=(SELECT owner_id FROM accounting_test_context)),'RLS : mouvements tiers invisibles';
END; $$;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',(SELECT owner_id FROM accounting_test_context),'role','authenticated')::text,true) IS NOT NULL AS session_configured;
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE id=(SELECT document_id FROM accounting_test_context)),'RLS : propriétaire autorisé';
  ASSERT EXISTS(SELECT 1 FROM winelio.wallet_movements WHERE user_id=(SELECT owner_id FROM accounting_test_context)),'RLS : mouvements propres visibles';
END; $$;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',(SELECT other_id FROM accounting_test_context),'role','authenticated','app_metadata',jsonb_build_object('role','super_admin'))::text,true) IS NOT NULL AS session_configured;
DO $$ BEGIN
  ASSERT EXISTS(SELECT 1 FROM winelio.accounting_documents WHERE id=(SELECT document_id FROM accounting_test_context)),'RLS : super admin autorisé';
END; $$;
RESET ROLE;
SELECT 'accounting-documents SQL: OK (ROLLBACK obligatoire)' AS result;
