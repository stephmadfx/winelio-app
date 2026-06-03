-- Migration : niveaux MLM à 3%
-- Change les defaults et les plans existants. Les commissions déjà créées ne sont pas recalculées.

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
           ALTER COLUMN level_1_percentage SET DEFAULT 3,
           ALTER COLUMN level_2_percentage SET DEFAULT 3,
           ALTER COLUMN level_3_percentage SET DEFAULT 3,
           ALTER COLUMN level_4_percentage SET DEFAULT 3,
           ALTER COLUMN level_5_percentage SET DEFAULT 3',
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
              SET level_1_percentage = 3,
                  level_2_percentage = 3,
                  level_3_percentage = 3,
                  level_4_percentage = 3,
                  level_5_percentage = 3,
                  updated_at = now()',
          target_table
        );
      ELSE
        EXECUTE format(
          'UPDATE %s
              SET level_1_percentage = 3,
                  level_2_percentage = 3,
                  level_3_percentage = 3,
                  level_4_percentage = 3,
                  level_5_percentage = 3',
          target_table
        );
      END IF;
    END IF;
  END LOOP;
END $$;
