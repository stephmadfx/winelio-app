-- Migration : Séparation des Wins et EUR dans le portefeuille
-- Modifie le trigger update_wallet_on_commission pour que les commissions de type 'professional_cashback'
-- créditent les colonnes total_wins et available_wins au lieu de total_earned et available.

CREATE OR REPLACE FUNCTION winelio.update_wallet_on_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN

    IF NEW.status = 'EARNED' THEN
      IF NEW.type = 'professional_cashback' THEN
        UPDATE winelio.user_wallet_summaries
        SET total_wins     = COALESCE(total_wins, 0) + NEW.amount,
            available_wins = COALESCE(available_wins, 0) + NEW.amount,
            updated_at     = now()
        WHERE user_id = NEW.user_id;
      ELSE
        UPDATE winelio.user_wallet_summaries
        SET total_earned = total_earned + NEW.amount,
            available    = available    + NEW.amount,
            updated_at   = now()
        WHERE user_id = NEW.user_id;
      END IF;

    ELSIF NEW.status = 'PENDING' THEN
      -- Les Wins en attente ne modifient pas les soldes EUR de pending_commissions.
      IF NEW.type != 'professional_cashback' THEN
        UPDATE winelio.user_wallet_summaries
        SET pending_commissions = pending_commissions + NEW.amount,
            updated_at          = now()
        WHERE user_id = NEW.user_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN

    -- PENDING → EARNED : libère les fonds
    IF OLD.status = 'PENDING' AND NEW.status = 'EARNED' THEN
      IF NEW.type = 'professional_cashback' THEN
        UPDATE winelio.user_wallet_summaries
        SET total_wins     = COALESCE(total_wins, 0) + NEW.amount,
            available_wins = COALESCE(available_wins, 0) + NEW.amount,
            updated_at     = now()
        WHERE user_id = NEW.user_id;
      ELSE
        UPDATE winelio.user_wallet_summaries
        SET pending_commissions = GREATEST(0, pending_commissions - OLD.amount),
            total_earned        = total_earned + NEW.amount,
            available           = available    + NEW.amount,
            updated_at          = now()
        WHERE user_id = NEW.user_id;
      END IF;

    -- EARNED → CANCELLED : retire les fonds
    ELSIF OLD.status = 'EARNED' AND NEW.status = 'CANCELLED' THEN
      IF OLD.type = 'professional_cashback' THEN
        UPDATE winelio.user_wallet_summaries
        SET total_wins     = GREATEST(0, COALESCE(total_wins, 0) - OLD.amount),
            available_wins = GREATEST(0, COALESCE(available_wins, 0) - OLD.amount),
            updated_at     = now()
        WHERE user_id = NEW.user_id;
      ELSE
        UPDATE winelio.user_wallet_summaries
        SET total_earned = GREATEST(0, total_earned - OLD.amount),
            available    = GREATEST(0, available    - OLD.amount),
            updated_at   = now()
        WHERE user_id = NEW.user_id;
      END IF;

    -- PENDING → CANCELLED : retire de l'en attente
    ELSIF OLD.status = 'PENDING' AND NEW.status = 'CANCELLED' THEN
      IF OLD.type != 'professional_cashback' THEN
        UPDATE winelio.user_wallet_summaries
        SET pending_commissions = GREATEST(0, pending_commissions - OLD.amount),
            updated_at          = now()
        WHERE user_id = NEW.user_id;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
