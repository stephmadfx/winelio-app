BEGIN;

-- Autorisation explicite des paiements carte hors session et suivi des tentatives
-- automatiques. Les cartes deja enregistrees ne sont pas autorisees par defaut.

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS stripe_off_session_consent_version text,
  ADD COLUMN IF NOT EXISTS stripe_off_session_consent_at timestamptz;

CREATE TABLE IF NOT EXISTS winelio.stripe_payment_method_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES winelio.profiles(id) ON DELETE CASCADE,
  setup_intent_id text NOT NULL UNIQUE,
  payment_method_id text NOT NULL,
  consent_version text NOT NULL,
  consent_text text NOT NULL,
  terms_version text NOT NULL,
  terms_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_consents_user
  ON winelio.stripe_payment_method_consents (user_id, accepted_at DESC);

ALTER TABLE winelio.stripe_payment_method_consents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION winelio.record_stripe_payment_method_consent(
  p_user_id uuid,
  p_setup_intent_id text,
  p_payment_method_id text,
  p_brand text,
  p_last4 text,
  p_consent_version text,
  p_consent_text text,
  p_terms_version text,
  p_terms_hash text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
BEGIN
  UPDATE winelio.stripe_payment_method_consents
  SET superseded_at = now()
  WHERE user_id = p_user_id
    AND superseded_at IS NULL
    AND setup_intent_id <> p_setup_intent_id;

  INSERT INTO winelio.stripe_payment_method_consents (
    user_id, setup_intent_id, payment_method_id, consent_version,
    consent_text, terms_version, terms_hash, user_agent
  ) VALUES (
    p_user_id, p_setup_intent_id, p_payment_method_id, p_consent_version,
    p_consent_text, p_terms_version, p_terms_hash, p_user_agent
  )
  ON CONFLICT (setup_intent_id) DO NOTHING;

  UPDATE winelio.profiles
  SET stripe_payment_method_id = p_payment_method_id,
      stripe_payment_method_brand = p_brand,
      stripe_payment_method_last4 = p_last4,
      stripe_payment_method_saved_at = now(),
      stripe_off_session_consent_version = p_consent_version,
      stripe_off_session_consent_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION winelio.record_stripe_payment_method_consent(
  uuid, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.record_stripe_payment_method_consent(
  uuid, text, text, text, text, text, text, text, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION winelio.revoke_stripe_payment_method_consent(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
BEGIN
  UPDATE winelio.stripe_payment_method_consents
  SET superseded_at = COALESCE(superseded_at, now())
  WHERE user_id = p_user_id AND superseded_at IS NULL;

  UPDATE winelio.profiles
  SET stripe_payment_method_id = NULL,
      stripe_payment_method_brand = NULL,
      stripe_payment_method_last4 = NULL,
      stripe_payment_method_saved_at = NULL,
      stripe_off_session_consent_version = NULL,
      stripe_off_session_consent_at = NULL
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION winelio.revoke_stripe_payment_method_consent(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.revoke_stripe_payment_method_consent(uuid)
  TO service_role;

-- La table historique suit desormais les paiements Checkout et les debits carte.
ALTER TABLE winelio.stripe_payment_sessions
  ALTER COLUMN stripe_session_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'checkout',
  ADD COLUMN IF NOT EXISTS deal_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS commission_rate numeric(7,4),
  ADD COLUMN IF NOT EXISTS compensation_plan_id uuid REFERENCES winelio.compensation_plans(id),
  ADD COLUMN IF NOT EXISTS plan_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_message text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE winelio.stripe_payment_sessions
  DROP CONSTRAINT IF EXISTS stripe_payment_sessions_status_check;
ALTER TABLE winelio.stripe_payment_sessions
  ADD CONSTRAINT stripe_payment_sessions_status_check
  CHECK (status IN ('processing', 'pending', 'paid', 'failed', 'expired', 'refunded'));

ALTER TABLE winelio.stripe_payment_sessions
  DROP CONSTRAINT IF EXISTS stripe_payment_sessions_payment_mode_check;
ALTER TABLE winelio.stripe_payment_sessions
  ADD CONSTRAINT stripe_payment_sessions_payment_mode_check
  CHECK (payment_mode IN ('automatic_card', 'checkout'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_payment_intent_id
  ON winelio.stripe_payment_sessions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_payment_active
  ON winelio.stripe_payment_sessions (recommendation_id)
  WHERE status IN ('processing', 'pending');

-- Verrou transactionnel anti-double encaissement. Une recommandation ne peut
-- avoir qu'un seul paiement gagnant, même si Checkout et PaymentIntent se
-- terminent au même instant.
CREATE OR REPLACE FUNCTION winelio.claim_stripe_commission_payment(
  p_payment_record_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = winelio, public
AS $$
DECLARE
  v_recommendation_id uuid;
  v_status text;
  v_existing_id uuid;
BEGIN
  SELECT recommendation_id, status
  INTO v_recommendation_id, v_status
  FROM winelio.stripe_payment_sessions
  WHERE id = p_payment_record_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'payment_not_found');
  END IF;

  PERFORM id
  FROM winelio.recommendations
  WHERE id = v_recommendation_id
  FOR UPDATE;

  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('claimed', true, 'already_claimed', true);
  END IF;

  SELECT id INTO v_existing_id
  FROM winelio.stripe_payment_sessions
  WHERE recommendation_id = v_recommendation_id
    AND status = 'paid'
    AND id <> p_payment_record_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'existing_payment_record_id', v_existing_id
    );
  END IF;

  UPDATE winelio.stripe_payment_sessions
  SET status = 'paid', paid_at = COALESCE(paid_at, now())
  WHERE id = p_payment_record_id;

  RETURN jsonb_build_object('claimed', true, 'already_claimed', false);
END;
$$;

REVOKE ALL ON FUNCTION winelio.claim_stripe_commission_payment(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION winelio.claim_stripe_commission_payment(uuid)
  TO service_role;

-- Creer une nouvelle version de travail des CGV sans modifier le document
-- historique deja accepte par les utilisateurs.
DO $$
DECLARE
  v_source_id uuid;
  v_new_id uuid;
BEGIN
  SELECT id INTO v_source_id
  FROM winelio.legal_documents
  WHERE title = 'Conditions Professionnels / CGV'
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT id INTO v_new_id
  FROM winelio.legal_documents
  WHERE title = 'Conditions Professionnels / CGV'
    AND version = '2026-09-03'
  LIMIT 1;

  IF v_source_id IS NOT NULL AND v_new_id IS NULL THEN
    INSERT INTO winelio.legal_documents (title, version, status)
    VALUES ('Conditions Professionnels / CGV', '2026-09-03', 'validated')
    RETURNING id INTO v_new_id;

    INSERT INTO winelio.document_sections (
      document_id, order_index, article_number, title, content
    )
    SELECT v_new_id, order_index, article_number, title, content
    FROM winelio.document_sections
    WHERE document_id = v_source_id;

    UPDATE winelio.document_sections
    SET content = replace(
      replace(
        content,
        $OLD_RATE$Bareme de travail a valider :

- 10 % du montant TTC de la prestation jusqu'a 25 000 euros TTC ;
- 5 % sur la part du montant TTC excedant 25 000 euros TTC.

Point en attente de validation finale : le seuil de 25 000 euros doit etre precise. Il peut s'agir, selon la decision commerciale retenue, d'un seuil par mission, par client final, par professionnel ou par annee civile.$OLD_RATE$,
        $NEW_RATE$Le taux est determine pour chaque affaire prise individuellement :

- 10 % du montant TTC total de l'affaire lorsque celui-ci est inferieur ou egal a 25 000 euros TTC ;
- 5 % du montant TTC total de l'affaire lorsque celui-ci est strictement superieur a 25 000 euros TTC.

Le taux de 5 % s'applique donc a la totalite du montant TTC de l'affaire concernee, et non a la seule fraction depassant 25 000 euros TTC.$NEW_RATE$
      ),
      '- la prestation a ete realisee et/ou payee selon le workflow applicable ;',
      '- le Professionnel a declare dans Winelio que la prestation est terminee et que le paiement du Client final a ete effectivement encaisse ;'
    )
    WHERE document_id = v_new_id AND article_number = '6';

    UPDATE winelio.document_sections
    SET content = $CGV$
Lorsqu'il enregistre sa carte et coche la case d'autorisation correspondante, le Professionnel autorise expressement Winelio a initier, sans nouvelle validation de sa part, un debit automatique par carte pour chaque commission d'intermediation devenue exigible.

Le montant de chaque debit est variable. Il correspond au montant TTC de chaque affaire, multiplie par le taux applicable : 10 % lorsque le montant est inferieur ou egal a 25 000 euros TTC, ou 5 % sur la totalite du montant lorsque l'affaire depasse 25 000 euros TTC. Le fait generateur du debit est la declaration par le Professionnel, dans le workflow Winelio, qu'il a effectivement encaisse le paiement de son Client final.

Aucun montant n'est debite lors du seul enregistrement de la carte. L'autorisation porte sur des paiements futurs ponctuels, lies aux recommandations effectivement abouties, et non sur un abonnement.

L'autorisation est recueillie de maniere explicite avant l'enregistrement de la carte. Winelio conserve la version du texte accepte, la date d'acceptation et les references techniques necessaires a la preuve de cette autorisation. Le Professionnel peut remplacer ou retirer son moyen de paiement pour les operations futures. Cette modification n'eteint pas les commissions deja dues.

Si le debit automatique est refuse, si la carte est expiree ou si la banque exige une authentification forte, Winelio adresse au Professionnel un lien Stripe securise lui permettant d'authentifier le paiement ou de choisir un autre moyen de paiement. Ce lien est egalement accessible depuis le suivi de la recommandation.

Une facture ou un justificatif mentionnant le montant de la commission est mis a disposition ou adresse au Professionnel. Aucune commission affiliee n'est rendue disponible au retrait avant l'encaissement effectif et confirme du paiement par Stripe.

Winelio n'agit pas comme prestataire de services de paiement. Les operations de paiement sont executees par Stripe ou par tout autre prestataire tiers agree ou habilite, selon ses propres conditions.

En cas d'echec du debit automatique, les sommes dues par le Professionnel sont payables dans un delai de 15 jours a compter de l'emission de la facture ou de la demande de regularisation.
$CGV$
    WHERE document_id = v_new_id AND article_number = '7';
  END IF;
END;
$$;

COMMIT;
