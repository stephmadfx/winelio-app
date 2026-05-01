-- Numéro d'assurance professionnelle (responsabilité civile pro), saisi à l'onboarding pro.
-- Verrouillé en édition côté pro : modifiable uniquement via demande au support.
-- Optionnel pour permettre l'onboarding d'un pro qui n'a pas encore souscrit (rare),
-- et nullable pour ne pas bloquer les pros existants.
ALTER TABLE winelio.companies
  ADD COLUMN IF NOT EXISTS insurance_number TEXT;
