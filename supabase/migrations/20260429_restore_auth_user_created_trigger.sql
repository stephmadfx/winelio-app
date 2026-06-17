-- Restore auth.users trigger after self-hosted migration.
-- The function exists in the winelio schema, but the trigger can be missed
-- when auth schema objects are migrated separately.

DROP TRIGGER IF EXISTS on_auth_user_created_winelio ON auth.users;

CREATE TRIGGER on_auth_user_created_winelio
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION winelio.handle_new_user();
