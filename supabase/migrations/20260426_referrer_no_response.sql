ALTER TABLE winelio.recommendations
  ADD COLUMN IF NOT EXISTS referrer_no_response_notified_at timestamptz;

COMMENT ON COLUMN winelio.recommendations.referrer_no_response_notified_at IS
  'Date de notification au referrer que le pro scrappé n''a pas répondu aux deux emails (24h après la relance)';
