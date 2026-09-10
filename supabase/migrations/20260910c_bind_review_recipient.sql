BEGIN;
ALTER TABLE winelio.review_invitations ADD COLUMN IF NOT EXISTS recipient_hash text;
COMMIT;
