-- After backfill, enforce NOT NULL constraint on alias
ALTER TABLE companies ALTER COLUMN alias SET NOT NULL;
