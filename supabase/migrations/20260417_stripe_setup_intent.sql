-- Ajout des champs Stripe pour le flow Setup Intent
-- Objectif : un pro doit enregistrer sa carte (sans débit) pour accéder
-- aux coordonnées d'un lead. Débit ultérieur à l'étape 7 (paiement reçu).

ALTER TABLE winelio.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id        text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_id  text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_brand text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_last4 text,
  ADD COLUMN IF NOT EXISTS stripe_payment_method_saved_at timestamptz;

-- Index pour retrouver un profil depuis un customer_id webhook
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON winelio.profiles (stripe_customer_id);
