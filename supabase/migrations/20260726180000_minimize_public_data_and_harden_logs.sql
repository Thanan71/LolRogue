-- Minimize public leaderboard data and make client diagnostics bounded,
-- attributable and short-lived.

BEGIN;

-- ---------------------------------------------------------------------------
-- Minimal public leaderboard contract
-- ---------------------------------------------------------------------------

DROP VIEW public.leaderboard;

CREATE VIEW public.leaderboard
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  ROW_NUMBER() OVER (
    ORDER BY
      player.total_wins DESC,
      player.total_waves_completed DESC,
      player.created_at ASC,
      player.id ASC
  )::INTEGER AS rank,
  COALESCE(NULLIF(player.display_name, ''), player.username) AS player_name,
  player.avatar_url,
  player.level,
  player.total_wins,
  player.total_runs_completed,
  CASE
    WHEN player.total_runs_completed > 0
      THEN ROUND(
        player.total_wins::NUMERIC
          / player.total_runs_completed::NUMERIC
          * 100,
        2
      )
    ELSE 0
  END AS win_rate,
  player.total_waves_completed
FROM public.players AS player;

REVOKE ALL ON TABLE public.leaderboard
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.leaderboard TO anon, authenticated, service_role;

CREATE FUNCTION public.get_my_leaderboard_rank()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ranked.rank
  FROM (
    SELECT
      player.user_id,
      ROW_NUMBER() OVER (
        ORDER BY
          player.total_wins DESC,
          player.total_waves_completed DESC,
          player.created_at ASC,
          player.id ASC
      )::INTEGER AS rank
    FROM public.players AS player
  ) AS ranked
  WHERE ranked.user_id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION public.get_my_leaderboard_rank()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_rank() TO authenticated;

-- ---------------------------------------------------------------------------
-- Recursive and bounded server-side log sanitation
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.sanitize_log_text(
  p_value TEXT,
  p_max_length INTEGER
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT LEFT(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            COALESCE(p_value, ''),
            'bearer[[:space:]]+[A-Za-z0-9._~+/=-]+',
            'Bearer [REDACTED]',
            'gi'
          ),
          'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',
          '[JWT]',
          'g'
        ),
        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
        '[EMAIL]',
        'g'
      ),
      '(password|token|secret|api[_-]?key|credential)([=:])[^&[:space:]]+',
      '\1\2[REDACTED]',
      'gi'
    ),
    GREATEST(0, p_max_length)
  )
$$;

CREATE FUNCTION public.sanitize_log_jsonb(
  p_value JSONB,
  p_depth INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_depth >= 6 THEN
    RETURN TO_JSONB('[MAX_DEPTH]'::TEXT);
  END IF;

  CASE JSONB_TYPEOF(p_value)
    WHEN 'object' THEN
      SELECT COALESCE(
        JSONB_OBJECT_AGG(
          entry.key,
          CASE
            WHEN entry.key ~* '(pass(word)?|token|secret|api.?key|authorization|cookie|credential|session|(user|player).?id)'
              THEN TO_JSONB('[REDACTED]'::TEXT)
            ELSE public.sanitize_log_jsonb(entry.value, p_depth + 1)
          END
        ),
        '{}'::JSONB
      )
      INTO v_result
      FROM (
        SELECT key, value
        FROM JSONB_EACH(p_value)
        ORDER BY key
        LIMIT 50
      ) AS entry;
      RETURN v_result;
    WHEN 'array' THEN
      SELECT COALESCE(
        JSONB_AGG(public.sanitize_log_jsonb(entry.value, p_depth + 1) ORDER BY entry.ordinality),
        '[]'::JSONB
      )
      INTO v_result
      FROM (
        SELECT value, ordinality
        FROM JSONB_ARRAY_ELEMENTS(p_value) WITH ORDINALITY
        ORDER BY ordinality
        LIMIT 20
      ) AS entry;
      RETURN v_result;
    WHEN 'string' THEN
      RETURN TO_JSONB(public.sanitize_log_text(p_value #>> '{}', 512));
    ELSE
      RETURN p_value;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.sanitize_log_text(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sanitize_log_jsonb(JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

-- Existing anonymous rows remain available to administrators until retention
-- removes them. The NOT VALID constraint applies immediately to every new row
-- without destructively rewriting unverifiable historical diagnostics.
ALTER TABLE public.logs
  DROP CONSTRAINT logs_user_id_fkey,
  ADD CONSTRAINT logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT logs_authenticated_identity
    CHECK (user_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT logs_error_message_size
    CHECK (OCTET_LENGTH(COALESCE(error_message, '')) <= 1024) NOT VALID,
  ADD CONSTRAINT logs_error_stack_size
    CHECK (OCTET_LENGTH(COALESCE(error_stack, '')) <= 8192) NOT VALID,
  ADD CONSTRAINT logs_details_contract
    CHECK (
      JSONB_TYPEOF(details) = 'object'
      AND OCTET_LENGTH(details::TEXT) <= 8192
    ) NOT VALID,
  ADD CONSTRAINT logs_duration_contract
    CHECK (
      duration_ms IS NULL
      OR (duration_ms >= 0 AND duration_ms <= 3600000)
    ) NOT VALID;

DROP POLICY IF EXISTS "Logs insert own" ON public.logs;
REVOKE INSERT ON TABLE public.logs FROM anon, authenticated;

CREATE FUNCTION public.purge_expired_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.logs
  WHERE created_at < CLOCK_TIMESTAMP() - INTERVAL '14 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_logs()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_logs() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'lolrogue-purge-expired-client-logs',
  '17 3 * * *',
  'SELECT public.purge_expired_logs()'
);

CREATE FUNCTION public.submit_client_logs(p_logs JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_player_id UUID;
  v_now TIMESTAMPTZ := CLOCK_TIMESTAMP();
  v_batch_size INTEGER;
  v_recent_minute INTEGER;
  v_recent_day INTEGER;
  v_global_minute INTEGER;
  v_log JSONB;
  v_level TEXT;
  v_repository TEXT;
  v_method TEXT;
  v_table_name TEXT;
  v_operation TEXT;
  v_duration NUMERIC(10, 2);
  v_error_message TEXT;
  v_error_stack TEXT;
  v_details JSONB;
  v_session_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF JSONB_TYPEOF(p_logs) <> 'array' THEN
    RAISE EXCEPTION 'invalid_log_batch' USING ERRCODE = '22023';
  END IF;

  v_batch_size := JSONB_ARRAY_LENGTH(p_logs);
  IF v_batch_size < 1 OR v_batch_size > 10
    OR OCTET_LENGTH(p_logs::TEXT) > 65536 THEN
    RAISE EXCEPTION 'invalid_log_batch' USING ERRCODE = '22023';
  END IF;

  -- Serialize quota decisions for one authenticated identity so concurrent
  -- batches cannot race past the limits.
  PERFORM pg_catalog.pg_advisory_xact_lock(9404, 1);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT, 9404)
  );
  PERFORM public.purge_expired_logs();

  SELECT id INTO v_player_id
  FROM public.players
  WHERE user_id = v_user_id;

  SELECT COUNT(*) INTO v_recent_minute
  FROM public.logs
  WHERE user_id = v_user_id
    AND created_at >= v_now - INTERVAL '1 minute';

  SELECT COUNT(*) INTO v_recent_day
  FROM public.logs
  WHERE user_id = v_user_id
    AND created_at >= v_now - INTERVAL '24 hours';

  SELECT COUNT(*) INTO v_global_minute
  FROM public.logs
  WHERE created_at >= v_now - INTERVAL '1 minute';

  IF v_recent_minute + v_batch_size > 30
    OR v_recent_day + v_batch_size > 500
    OR v_global_minute + v_batch_size > 1000 THEN
    RAISE EXCEPTION 'log_rate_limit_exceeded' USING ERRCODE = '54000';
  END IF;

  FOR v_log IN
    SELECT value FROM JSONB_ARRAY_ELEMENTS(p_logs)
  LOOP
    IF JSONB_TYPEOF(v_log) <> 'object' THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;

    v_level := v_log ->> 'level';
    v_repository := BTRIM(v_log ->> 'repository');
    v_method := BTRIM(v_log ->> 'method');
    v_table_name := NULLIF(BTRIM(v_log ->> 'table_name'), '');
    v_operation := v_log ->> 'operation';

    IF v_level IS NULL OR v_level NOT IN ('debug', 'info', 'warn', 'error')
      OR v_repository IS NULL
      OR v_repository !~ '^[A-Za-z0-9_.:-]{1,100}$'
      OR v_method IS NULL
      OR v_method !~ '^[A-Za-z0-9_.:-]{1,100}$'
      OR v_operation IS NULL
      OR v_operation NOT IN ('select', 'insert', 'update', 'upsert', 'delete', 'auth', 'other')
      OR (
        v_table_name IS NOT NULL
        AND v_table_name !~ '^[A-Za-z0-9_.:-]{1,100}$'
      ) THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;

    IF v_log ? 'duration_ms' AND JSONB_TYPEOF(v_log -> 'duration_ms') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;
    v_duration := CASE
      WHEN JSONB_TYPEOF(v_log -> 'duration_ms') = 'number'
        THEN (v_log ->> 'duration_ms')::NUMERIC
      ELSE NULL
    END;
    IF v_duration IS NOT NULL AND (v_duration < 0 OR v_duration > 3600000) THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;

    IF v_log ? 'error_message'
      AND JSONB_TYPEOF(v_log -> 'error_message') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;
    IF v_log ? 'error_stack'
      AND JSONB_TYPEOF(v_log -> 'error_stack') NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;
     v_error_message := CASE
       WHEN JSONB_TYPEOF(v_log -> 'error_message') = 'string'
         -- UTF-8 uses at most four bytes per character.
         THEN public.sanitize_log_text(v_log ->> 'error_message', 256)
       ELSE NULL
     END;
     v_error_stack := CASE
       WHEN JSONB_TYPEOF(v_log -> 'error_stack') = 'string'
         THEN public.sanitize_log_text(v_log ->> 'error_stack', 2048)
      ELSE NULL
    END;

    v_details := COALESCE(v_log -> 'details', '{}'::JSONB);
    IF JSONB_TYPEOF(v_details) <> 'object'
      OR OCTET_LENGTH(v_details::TEXT) > 32768 THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;
    v_details := public.sanitize_log_jsonb(v_details);
    IF OCTET_LENGTH(v_details::TEXT) > 8192 THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_session_id := COALESCE(
        NULLIF(v_log ->> 'session_id', '')::UUID,
        extensions.gen_random_uuid()
      );
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_log_entry' USING ERRCODE = '22023';
    END;

    INSERT INTO public.logs (
      created_at,
      level,
      repository,
      method,
      table_name,
      operation,
      duration_ms,
      error_message,
      error_stack,
      details,
      user_id,
      player_id,
      session_id
    )
    VALUES (
      v_now,
      v_level,
      v_repository,
      v_method,
      v_table_name,
      v_operation,
      v_duration,
      v_error_message,
      v_error_stack,
      v_details,
      v_user_id,
      v_player_id,
      v_session_id
    );
  END LOOP;

  -- Retention bounds each identity even before the 14-day cutoff is reached.
  DELETE FROM public.logs
  WHERE id IN (
    SELECT old_log.id
    FROM public.logs AS old_log
    WHERE old_log.user_id = v_user_id
    ORDER BY old_log.created_at DESC, old_log.id DESC
    OFFSET 2000
  );

  RETURN v_batch_size;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_client_logs(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_client_logs(JSONB) TO authenticated;

COMMIT;
