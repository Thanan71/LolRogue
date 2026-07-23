-- Accept decimal combat statistics from clients while keeping integer database columns.

BEGIN;

ALTER FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER)
RENAME TO save_completed_run_integer_payload;

REVOKE ALL ON FUNCTION public.save_completed_run_integer_payload(JSONB, JSONB, JSONB, INTEGER)
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_completed_run(
  p_run JSONB,
  p_team_members JSONB,
  p_mastery JSONB,
  p_total_candies INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run JSONB := COALESCE(p_run, '{}'::JSONB);
  v_team_members JSONB;
  v_mastery JSONB;
BEGIN
  v_run := jsonb_set(v_run, '{run_level}', to_jsonb(ROUND(COALESCE((v_run ->> 'run_level')::NUMERIC, 1))), TRUE);
  v_run := jsonb_set(v_run, '{waves_completed}', to_jsonb(ROUND(COALESCE((v_run ->> 'waves_completed')::NUMERIC, 0))), TRUE);
  v_run := jsonb_set(v_run, '{gold_earned}', to_jsonb(ROUND(COALESCE((v_run ->> 'gold_earned')::NUMERIC, 0))), TRUE);
  v_run := jsonb_set(v_run, '{total_kills}', to_jsonb(ROUND(COALESCE((v_run ->> 'total_kills')::NUMERIC, 0))), TRUE);
  v_run := jsonb_set(v_run, '{total_damage_dealt}', to_jsonb(ROUND(COALESCE((v_run ->> 'total_damage_dealt')::NUMERIC, 0))), TRUE);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(value, '{final_level}', to_jsonb(ROUND(COALESCE((value ->> 'final_level')::NUMERIC, 1))), TRUE),
            '{final_hp}', to_jsonb(ROUND(COALESCE((value ->> 'final_hp')::NUMERIC, 0))), TRUE
          ),
          '{kills}', to_jsonb(ROUND(COALESCE((value ->> 'kills')::NUMERIC, 0))), TRUE
        ),
        '{damage_dealt}', to_jsonb(ROUND(COALESCE((value ->> 'damage_dealt')::NUMERIC, 0))), TRUE
      )
    ),
    '[]'::JSONB
  )
  INTO v_team_members
  FROM jsonb_array_elements(COALESCE(p_team_members, '[]'::JSONB));

  SELECT COALESCE(
    jsonb_agg(
      jsonb_set(
        jsonb_set(
          jsonb_set(value, '{candies_earned}', to_jsonb(ROUND(COALESCE((value ->> 'candies_earned')::NUMERIC, 0))), TRUE),
          '{kills}', to_jsonb(ROUND(COALESCE((value ->> 'kills')::NUMERIC, 0))), TRUE
        ),
        '{total_damage}', to_jsonb(ROUND(COALESCE((value ->> 'total_damage')::NUMERIC, 0))), TRUE
      )
    ),
    '[]'::JSONB
  )
  INTO v_mastery
  FROM jsonb_array_elements(COALESCE(p_mastery, '[]'::JSONB));

  RETURN public.save_completed_run_integer_payload(
    v_run,
    v_team_members,
    v_mastery,
    p_total_candies
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER) TO authenticated;

COMMIT;
