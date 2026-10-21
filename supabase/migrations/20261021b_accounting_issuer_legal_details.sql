BEGIN;
ALTER TABLE winelio.accounting_issuers ADD COLUMN legal_form text;
ALTER TABLE winelio.accounting_issuers ADD COLUMN share_capital numeric CHECK (share_capital >= 0);
-- RNE / INPI vérifié le 21/10/2026 : https://data.inpi.fr/export/companies?format=pdf&ids=%5B%22422432864%22%5D
UPDATE winelio.accounting_issuers SET legal_form='SAS',share_capital=7622.45
  WHERE siren='422432864';
NOTIFY pgrst,'reload schema';
COMMIT;
