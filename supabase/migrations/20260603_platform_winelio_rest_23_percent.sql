-- Migration : Winelio prend tout le reste de la commission
-- Avec 60% recommandeur + 5x3% niveaux MLM + 1% affiliation + 1% cashback,
-- la part explicite Winelio doit etre 23% pour distribuer 100% de la commission.
-- Les commissions deja creees ne sont pas recalculees.

DO $$
DECLARE
  target_table text;
  has_updated_at boolean;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['winelio.compensation_plans', 'public.compensation_plans']
  LOOP
    IF to_regclass(target_table) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %s
           ALTER COLUMN platform_percentage SET DEFAULT 23',
        target_table
      );

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns AS c
        WHERE c.table_schema = split_part(target_table, '.', 1)
          AND c.table_name = split_part(target_table, '.', 2)
          AND c.column_name = 'updated_at'
      )
      INTO has_updated_at;

      IF has_updated_at THEN
        EXECUTE format(
          'UPDATE %s
              SET platform_percentage = 23,
                  updated_at = now()',
          target_table
        );
      ELSE
        EXECUTE format(
          'UPDATE %s
              SET platform_percentage = 23',
          target_table
        );
      END IF;
    END IF;
  END LOOP;
END $$;
