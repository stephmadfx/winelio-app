-- Fix infinite loop in sponsor code generation.
-- In PL/pgSQL, an unqualified "code = code" expression can resolve to the
-- function variable on both sides. Use a distinct variable name and explicit
-- table aliases.

CREATE OR REPLACE FUNCTION winelio.generate_unique_sponsor_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars    text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  new_code text;
BEGIN
  LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(chars, floor(random() * 36 + 1)::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM winelio.profiles p
      WHERE p.sponsor_code = new_code
    )
    AND NOT EXISTS (
      SELECT 1
      FROM winelio.deleted_sponsor_codes d
      WHERE d.sponsor_code = new_code
    );
  END LOOP;

  RETURN new_code;
END;
$$;
