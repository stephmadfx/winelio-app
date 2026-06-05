-- Prépare le barème dégressif des commissions sans changer le comportement actuel.
-- Par défaut, le taux reste celui du plan (10% sur le plan standard). Si un taux
-- au-delà du seuil est renseigné plus tard, le code l'utilisera automatiquement.

ALTER TABLE winelio.compensation_plans
  ADD COLUMN IF NOT EXISTS high_amount_threshold numeric DEFAULT 25000,
  ADD COLUMN IF NOT EXISTS high_amount_commission_rate numeric;
