-- supabase/migrations/003_global_highlights_fn.sql

CREATE OR REPLACE FUNCTION public.get_global_highlights()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top_sponsor jsonb := NULL;
  v_top_reco    jsonb := NULL;
  v_top_comm    jsonb := NULL;
  v_today       timestamptz := date_trunc('day', now());
  v_week_start  timestamptz := date_trunc('week', now());
  v_result      jsonb := '[]'::jsonb;
BEGIN
  -- Top parrain de la semaine (le plus de nouveaux filleuls sur 7 jours)
  SELECT jsonb_build_object(
    'kind',      'top_sponsor',
    'user',      COALESCE(
                   p.first_name || ' ' ||
                   LEFT(COALESCE(p.last_name, ''), 1) ||
                   CASE WHEN p.last_name IS NOT NULL THEN '.' ELSE '' END,
                   'Un membre'
                 ),
    'city',      p.city,
    'count',     COUNT(f.id)::int,
    'period',    'week',
    'timestamp', now()::text
  )
  INTO v_top_sponsor
  FROM profiles p
  JOIN profiles f ON f.sponsor_id = p.id
  WHERE f.created_at >= v_week_start
  GROUP BY p.id, p.first_name, p.last_name, p.city
  ORDER BY COUNT(f.id) DESC
  LIMIT 1;

  -- Plus grosse reco complétée du jour
  SELECT jsonb_build_object(
    'kind',      'top_reco',
    'amount',    r.amount,
    'city',      p.city,
    'date',      r.created_at::text,
    'timestamp', r.created_at::text
  )
  INTO v_top_reco
  FROM recommendations r
  JOIN profiles p ON p.id = r.referrer_id
  WHERE r.status = 'COMPLETED'
    AND r.created_at >= v_today
    AND r.amount IS NOT NULL
  ORDER BY r.amount DESC
  LIMIT 1;

  -- Plus grosse commission EARNED du jour > 100€
  SELECT jsonb_build_object(
    'kind',      'big_commission',
    'user',      COALESCE(
                   p.first_name || ' ' ||
                   LEFT(COALESCE(p.last_name, ''), 1) ||
                   CASE WHEN p.last_name IS NOT NULL THEN '.' ELSE '' END,
                   'Un membre'
                 ),
    'city',      p.city,
    'amount',    ct.amount,
    'timestamp', ct.created_at::text
  )
  INTO v_top_comm
  FROM commission_transactions ct
  JOIN profiles p ON p.id = ct.user_id
  WHERE ct.amount > 100
    AND ct.status = 'EARNED'
    AND ct.created_at >= v_today
  ORDER BY ct.amount DESC
  LIMIT 1;

  -- Assembler les résultats non-nuls
  IF v_top_sponsor IS NOT NULL THEN
    v_result := v_result || jsonb_build_array(v_top_sponsor);
  END IF;
  IF v_top_reco IS NOT NULL THEN
    v_result := v_result || jsonb_build_array(v_top_reco);
  END IF;
  IF v_top_comm IS NOT NULL THEN
    v_result := v_result || jsonb_build_array(v_top_comm);
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_highlights() TO anon, authenticated;
