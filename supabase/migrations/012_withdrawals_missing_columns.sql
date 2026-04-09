-- Migration 012 : colonnes manquantes sur withdrawals
-- rejection_reason absent → rejectWithdrawal échoue silencieusement

ALTER TABLE winelio.withdrawals
  ADD COLUMN IF NOT EXISTS rejection_reason text;
