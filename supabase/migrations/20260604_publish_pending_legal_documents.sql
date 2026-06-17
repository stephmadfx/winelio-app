-- Publie les documents juridiques 2026-06-04 avec les champs administratifs
-- incomplets explicitement marques "en attente de validation".
-- Perimetre volontairement limite au schema winelio et a la version 2026-06-04.

BEGIN;

UPDATE winelio.document_sections s
SET content = replace(s.content, '[A COMPLETER : dpo@winelio.app ou privacy@winelio.app]', 'Contact RGPD en attente de validation. Dans l''intervalle, les demandes peuvent etre adressees a contact@winelio.app.')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, '[A COMPLETER : Coolify auto-heberge sur VPS Hostinger ?]', 'en attente de validation')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, '[A COMPLETER : par exemple taux BCE + 10 points, ou autre taux conforme]', 'en attente de validation finale')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, 'Le taux des penalites de retard est fixe a en attente de validation finale, sans pouvoir etre inferieur au minimum legal applicable.', 'Le taux des penalites de retard est en attente de validation finale, sans pouvoir etre inferieur au minimum legal applicable.')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, '[A COMPLETER, si applicable]', 'en attente de validation, si applicable')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, '[A COMPLETER]', 'en attente de validation')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, 'Point a valider avant publication', 'Point en attente de validation finale')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, 'Point a completer avant publication', 'Point en attente de validation finale')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, 'Prestataires a valider et completer avant publication', 'Prestataires en attente de validation finale')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, 'Les durees ci-dessous sont des durees de travail a valider avant publication definitive.', 'Les durees ci-dessous sont publiees en attente de validation finale.')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.document_sections s
SET content = replace(s.content, 'sous reserve de completer les informations d''identification et la liste exacte des prestataires avant publication definitive.', 'les informations d''identification administrative et la liste exacte des prestataires seront completees apres validation finale.')
FROM winelio.legal_documents d
WHERE d.id = s.document_id
  AND d.version = '2026-06-04';

UPDATE winelio.legal_documents
SET status = 'reviewing',
    updated_at = now()
WHERE version = '2026-06-04'
  AND title IN (
    'Mentions légales',
    'Conditions Générales d''Utilisation',
    'Conditions Professionnels / CGV',
    'Programme d''affiliation et Winelio Rewards',
    'Politique de confidentialité'
  );

COMMIT;
