-- Empêche l'auto-recommandation (referrer = professional)
ALTER TABLE winelio.recommendations
  ADD CONSTRAINT recommendations_no_self_referral
  CHECK (referrer_id <> professional_id);
