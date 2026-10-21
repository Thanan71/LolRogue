-- ADM-S6: bounded diagnostic projections. Logging remains opt-in; no ingestion,
-- identity, gameplay journal, result or moderation state is changed here.
BEGIN;
REVOKE ALL ON TABLE public.logs FROM PUBLIC, anon, authenticated;
DROP POLICY "Logs read own or admin" ON public.logs;
DROP POLICY "Logs delete admin" ON public.logs;
CREATE POLICY logs_api_deny ON public.logs AS RESTRICTIVE
  FOR ALL TO anon, authenticated, service_role
  USING (FALSE)
  WITH CHECK (FALSE);
CREATE FUNCTION private.diagnostic_stamp (value timestamptz)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
CREATE FUNCTION private.diagnostic_label (value text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    CASE WHEN value = ANY (ARRAY['SupabaseAuthRepository', 'SupabasePlayerRepository', 'SupabaseRunRepository', 'SupabaseRunStatsRepository', 'SupabaseMasteryRepository',
      'SupabasePlayerUnlockRepository', 'SupabaseDailyRunRepository', 'SupabaseLeaderboardRepository', 'SupabaseEnhancementRepository', 'SupabaseChampionEconomyRepository', 'client_observability',
      'getCurrentUser', 'getSession', 'onAuthStateChange', 'requestPasswordReset', 'signIn', 'signOut',
      'signUp', 'updatePassword', 'getSnapshot', 'purchaseChampion', 'getDailyChallenge', 'getDailyLeaderboard',
      'reportDailyScore', 'setLeaderboardPrivacy', 'getLeaderboard', 'getPlayerRank', 'getAllEnhancementStates', 'getEnhancementState',
      'unlockNode', 'getChampionMastery', 'getChampionMasteryByChampion', 'getPlayerUnlocks', 'hasUnlock', 'getPlayer',
      'getPlayerStats', 'touchLastLogin', 'updateProfile', 'getPlayerRunHistory', 'getPlayerRunRejections', 'getPlayerRuns',
      'getRun', 'getRunHistoryDetails', 'getRunTeamMembers', 'getPlayerRunStats', 'getRunDetails', 'frontend_error',
      'save_failure', 'retry', 'asset_failure', 'rehydration_error', 'transition_duration', 'players',
      'runs', 'run_attempts', 'daily_runs', 'champion_mastery', 'champion_enhancements', 'player_unlocks',
      'run_team_members', 'logs']) THEN
      value
    ELSE
      'unknown'
    END
$$;
CREATE FUNCTION private.diagnostic_attempt_id (value jsonb)
  RETURNS uuid
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    CASE WHEN jsonb_typeof(value -> 'attemptId') = 'string'
      AND value ->> 'attemptId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      (value ->> 'attemptId')::uuid
    END
$$;
CREATE FUNCTION private.diagnostic_log_item (value public.logs)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    jsonb_build_object('id', value.id, 'createdAt', private.diagnostic_stamp (value.created_at),
      'level', value.level, 'operation', value.operation, 'repository', private.diagnostic_label
      (value.repository), 'method', private.diagnostic_label (value.method), 'tableName', CASE WHEN
      value.table_name IS NOT NULL THEN
        private.diagnostic_label (value.table_name)
      END, 'durationMs', CASE WHEN value.duration_ms BETWEEN 0 AND 3600000 THEN
        value.duration_ms
      END,
      -- Legacy free text is withheld; metadata and exact attempt links are useful
      -- without disclosing addresses, tokens, commands or stack traces.
      'message', CASE WHEN value.error_message IS NULL THEN
        NULL
      ELSE
        '[REDACTED]'
      END, 'correlationId', value.session_id, 'attemptId', CASE WHEN EXISTS (
        SELECT
          1
        FROM public.run_attempts a
        WHERE
          a.id = private.diagnostic_attempt_id (value.details)
        AND a.user_id = value.user_id) THEN
        private.diagnostic_attempt_id (value.details)
      END)
$$;
CREATE FUNCTION private.diagnostic_attempt_item (value public.run_attempts)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    jsonb_build_object('id', value.id, 'startedAt', private.diagnostic_stamp (value.started_at),
      'status', value.status, 'engineVersion', CASE WHEN value.engine_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
        value.engine_version
      ELSE
        'unknown'
      END, 'gameplayRulesetVersion', value.gameplay_ruleset_version, 'rejectionCode', CASE WHEN value.rejection_code IS NULL THEN
        NULL
      WHEN value.rejection_code ~ '^[a-z][a-z0-9_]{0,63}$' THEN
        value.rejection_code
      ELSE
        'unknown'
      END, 'finishedAt', private.diagnostic_stamp (value.finished_at), 'terminalAt', private.diagnostic_stamp
  (COALESCE(value.verified_at, value.rejected_at, value.expired_at)))
$$;
-- Retention already uses created_at; these non-duplicated seek indexes provide
-- stable pagination and selective session/attempt correlations at any log age.
CREATE INDEX logs_diagnostic_order ON public.logs (created_at DESC, id DESC);
CREATE INDEX logs_diagnostic_session_order ON public.logs (session_id, created_at DESC, id DESC);
CREATE INDEX logs_diagnostic_attempt_order ON public.logs (private.diagnostic_attempt_id (details), created_at DESC, id DESC)
WHERE
  private.diagnostic_attempt_id (details) IS NOT NULL;
CREATE FUNCTION private.diagnostic_logs (f jsonb, stamp timestamptz, cursor_at timestamptz, cursor_id uuid, page_size integer)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH scoped AS NOT MATERIALIZED (
    SELECT
      l.*
    FROM
      public.logs l
    WHERE
      l.created_at <= stamp
      AND l.created_at >= statement_timestamp() - interval '14 days'
      AND l.created_at >= ((f ->> 'from')::date::timestamp AT TIME ZONE 'UTC')
      AND l.created_at < (((f ->> 'to')::date + 1)::timestamp AT TIME ZONE 'UTC')
      AND (f ->> 'level' IS NULL
        OR l.level = f ->> 'level')
      AND (f ->> 'operation' IS NULL
        OR l.operation = f ->> 'operation')
      AND (f ->> 'correlationId' IS NULL
        OR l.session_id = (f ->> 'correlationId')::uuid)
      AND (f ->> 'attemptId' IS NULL
        OR (private.diagnostic_attempt_id (l.details) = (f ->> 'attemptId')::uuid
          AND EXISTS (
            SELECT
              1
            FROM
              public.run_attempts a
            WHERE
              a.id = (f ->> 'attemptId')::uuid
              AND a.user_id = l.user_id)))
  ),
  page AS (
    SELECT
      s.*
    FROM
      scoped s
    WHERE
      cursor_at IS NULL
      OR (s.created_at,
        s.id) < (cursor_at,
        cursor_id)
    ORDER BY
      s.created_at DESC,
      s.id DESC
    LIMIT page_size + 1
  ),
  visible AS (
    SELECT
      *
    FROM
      page
    ORDER BY
      created_at DESC,
      id DESC
    LIMIT page_size
  )
  SELECT
    jsonb_build_object('total', (
        SELECT
          count(*)
        FROM scoped), 'rows', COALESCE((
        SELECT
          jsonb_agg(private.diagnostic_log_item (v)
        ORDER BY v.created_at DESC, v.id DESC)
        FROM visible v), '[]'::jsonb), 'nextCursor', CASE WHEN (
      SELECT
        count(*)
      FROM page) > page_size THEN
    (
      SELECT
        jsonb_build_object('at', private.diagnostic_stamp (created_at), 'id', id)
      FROM visible ORDER BY created_at, id LIMIT 1)
    END, 'retentionDays', 14)
$$;
CREATE FUNCTION private.diagnostic_authority (f jsonb, stamp timestamptz, cursor_at timestamptz, cursor_id uuid, page_size integer)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH scoped AS NOT MATERIALIZED (
    SELECT
      a.*
    FROM
      public.run_attempts a
    WHERE
      a.created_at <= stamp
      AND a.started_at <= stamp
      AND a.started_at >= ((f ->> 'from')::date::timestamp AT TIME ZONE 'UTC')
      AND a.started_at < (((f ->> 'to')::date + 1)::timestamp AT TIME ZONE 'UTC')
      AND (f ->> 'engineVersion' IS NULL
        OR a.engine_version = f ->> 'engineVersion')
      AND (f ->> 'gameplayRulesetVersion' IS NULL
        OR a.gameplay_ruleset_version = (f ->> 'gameplayRulesetVersion')::integer)
      AND (f ->> 'status' IS NULL
        OR a.status = f ->> 'status')
      AND (f ->> 'rejectionCode' IS NULL
        OR a.rejection_code = f ->> 'rejectionCode')
  ),
  page AS (
    SELECT
      *
    FROM
      scoped
    WHERE
      cursor_at IS NULL
      OR (started_at,
        id) < (cursor_at,
        cursor_id)
    ORDER BY
      started_at DESC,
      id DESC
    LIMIT page_size + 1
  ),
  visible AS (
    SELECT
      *
    FROM
      page
    ORDER BY
      started_at DESC,
      id DESC
    LIMIT page_size
  ),
  alerts AS NOT MATERIALIZED (
    SELECT
      a.window_started_at,
      CASE WHEN a.engine_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
        a.engine_version
      ELSE
        'unknown'
      END AS engine_version,
      a.gameplay_ruleset_version,
      CASE WHEN a.rejection_code IS NULL THEN
        NULL
      WHEN a.rejection_code ~ '^[a-z][a-z0-9_]{0,63}$' THEN
        a.rejection_code
      ELSE
        'unknown'
      END AS rejection_code,
      sum(a.attempt_count)::bigint AS attempt_count,
      sum(a.started_count)::bigint AS started_count,
      sum(a.finished_count)::bigint AS finished_count,
      sum(a.verified_count)::bigint AS verified_count,
      sum(a.rejected_count)::bigint AS rejected_count,
      sum(a.expired_count)::bigint AS expired_count
    FROM
      public.authority_attempt_aggregates a
    WHERE
      a.window_started_at >= date_trunc('minute', stamp) - interval '15 minutes'
      AND a.window_started_at < date_trunc('minute', stamp)
      AND (f ->> 'engineVersion' IS NULL
        OR a.engine_version = f ->> 'engineVersion')
      AND (f ->> 'gameplayRulesetVersion' IS NULL
        OR a.gameplay_ruleset_version = (f ->> 'gameplayRulesetVersion')::integer)
    GROUP BY
      a.window_started_at,
      2,
      a.gameplay_ruleset_version,
      4
  ),
  limited_alerts AS (
    SELECT
      *
    FROM
      alerts
    ORDER BY
      window_started_at,
      engine_version,
      gameplay_ruleset_version,
      rejection_code NULLS FIRST
    LIMIT 500
  )
  SELECT
    jsonb_build_object('total', (
        SELECT
          count(*)
        FROM scoped), 'rows', COALESCE((
        SELECT
          jsonb_agg(private.diagnostic_attempt_item (v)
        ORDER BY started_at DESC, id DESC)
        FROM visible v), '[]'::jsonb), 'nextCursor', CASE WHEN (
      SELECT
        count(*)
      FROM page) > page_size THEN
    (
      SELECT
        jsonb_build_object('at', private.diagnostic_stamp (started_at), 'id', id)
      FROM visible ORDER BY started_at, id LIMIT 1)
    END, 'counts', (
      SELECT
  jsonb_build_object('started', count(*) FILTER (WHERE status = 'started'), 'finished',
    count(*) FILTER (WHERE status = 'finished'), 'verified', count(*) FILTER (WHERE status =
    'verified'), 'rejected', count(*) FILTER (WHERE status = 'rejected'), 'expired',
    count(*) FILTER (WHERE status = 'expired'))
      FROM scoped), 'alerts', jsonb_build_object('from', private.diagnostic_stamp
  (date_trunc('minute', stamp) - interval '15 minutes'), 'to', private.diagnostic_stamp
  (date_trunc('minute', stamp)), 'totalGroups', (
        SELECT
          count(*)
        FROM alerts), 'complete', (
        SELECT
          count(*) <= 500 FROM alerts), 'aggregates', COALESCE((
        SELECT
    jsonb_agg(jsonb_build_object('windowStartedAt', private.diagnostic_stamp (window_started_at),
      'engineVersion', CASE WHEN engine_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' THEN
              engine_version
            ELSE
              'unknown'
            END, 'gameplayRulesetVersion', gameplay_ruleset_version, 'rejectionCode', CASE WHEN rejection_code IS NULL THEN
              NULL
            WHEN rejection_code ~ '^[a-z][a-z0-9_]{0,63}$' THEN
              rejection_code
            ELSE
              'unknown'
      END, 'attemptCount', attempt_count, 'startedCount', started_count, 'finishedCount', finished_count,
        'verifiedCount', verified_count, 'rejectedCount', rejected_count, 'expiredCount', expired_count)
        ORDER BY window_started_at, engine_version, gameplay_ruleset_version, rejection_code NULLS FIRST)
        FROM limited_alerts), '[]'::jsonb)))
$$;
CREATE FUNCTION private.diagnostic_service_metrics (f jsonb, stamp timestamptz, lo timestamptz, hi timestamptz)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH scoped AS NOT MATERIALIZED (
    SELECT
      a.*,
      COALESCE(a.verified_at, a.rejected_at) AS terminal_at
    FROM
      public.run_attempts a
    WHERE
      a.created_at <= stamp
      AND a.started_at <= stamp
      AND (f ->> 'engineVersion' IS NULL
        OR a.engine_version = f ->> 'engineVersion')
      AND (f ->> 'gameplayRulesetVersion' IS NULL
        OR a.gameplay_ruleset_version = (f ->> 'gameplayRulesetVersion')::integer)
      AND ((a.started_at >= lo
          AND a.started_at < hi)
        OR (a.finished_at >= lo
          AND a.finished_at < hi
          AND a.finished_at <= stamp))
  ),
  metrics AS (
    SELECT
      count(*) FILTER (WHERE started_at >= lo
        AND started_at < hi) AS started,
      count(*) FILTER (WHERE started_at >= lo
        AND started_at < hi
        AND status = 'verified') AS verified,
      count(*) FILTER (WHERE started_at >= lo
        AND started_at < hi
        AND status = 'rejected') AS rejected,
      count(*) FILTER (WHERE started_at >= lo
        AND started_at < hi
        AND status = 'expired') AS expired,
      count(*) FILTER (WHERE started_at >= lo
        AND started_at < hi
        AND status IN ('started', 'finished')) AS pending,
      count(*) FILTER (WHERE finished_at >= lo
        AND finished_at < hi
        AND finished_at <= stamp - interval '120 seconds') AS eligible,
      count(*) FILTER (WHERE finished_at >= lo
        AND finished_at < hi
        AND finished_at <= stamp - interval '120 seconds'
        AND status IN ('verified', 'rejected')
        AND terminal_at BETWEEN finished_at AND finished_at + interval '120 seconds'
        AND terminal_at <= stamp) AS within_slo,
      count(*) FILTER (WHERE finished_at >= lo
        AND finished_at < hi
        AND finished_at <= stamp
        AND status IN ('verified', 'rejected')
        AND terminal_at BETWEEN finished_at AND stamp) AS samples,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (terminal_at - finished_at)) * 1000) FILTER (WHERE finished_at >= lo
        AND finished_at < hi
        AND finished_at <= stamp
        AND status IN ('verified', 'rejected')
        AND terminal_at BETWEEN finished_at AND stamp) AS p95
    FROM
      scoped
  )
  SELECT
    jsonb_build_object('started', started, 'verified', verified, 'rejected', rejected,
      'expired', expired, 'pending', pending, 'eligibleSeals', eligible, 'withinSlo', within_slo,
      'terminalSamples', samples, 'sealToTerminalP95Ms', p95, 'sealToTerminalSli', CASE WHEN eligible > 0 THEN
        within_slo::numeric / eligible
      END)
  FROM
    metrics
$$;
CREATE FUNCTION private.diagnostic_service (f jsonb, stamp timestamptz)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH bounds AS (
    SELECT
      (f ->> 'from')::date::timestamp AT TIME ZONE 'UTC' AS lo,
      ((f ->> 'to')::date + 1)::timestamp AT TIME ZONE 'UTC' AS hi,
      CASE WHEN f ->> 'granularity' = 'hour' THEN
        interval '1 hour'
      ELSE
        interval '1 day'
      END AS step
  ),
  starts AS (
    SELECT
      date_trunc(f ->> 'granularity', a.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS at,
      count(*) AS started,
      count(*) FILTER (WHERE a.status = 'verified') AS verified,
      count(*) FILTER (WHERE a.status = 'rejected') AS rejected,
      count(*) FILTER (WHERE a.status = 'expired') AS expired,
      count(*) FILTER (WHERE a.status IN ('started', 'finished')) AS pending
    FROM
      public.run_attempts a
    CROSS JOIN bounds b
  WHERE
    a.created_at <= stamp
    AND a.started_at <= stamp
    AND a.started_at >= b.lo
    AND a.started_at < b.hi
    AND (f ->> 'engineVersion' IS NULL
      OR a.engine_version = f ->> 'engineVersion')
    AND (f ->> 'gameplayRulesetVersion' IS NULL
      OR a.gameplay_ruleset_version = (f ->> 'gameplayRulesetVersion')::integer)
  GROUP BY
    1
  ),
  seals AS (
    SELECT
      date_trunc(f ->> 'granularity', a.finished_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS at,
      count(*) FILTER (WHERE a.finished_at <= stamp - interval '120 seconds') AS eligible,
      count(*) FILTER (WHERE a.finished_at <= stamp - interval '120 seconds'
        AND a.status IN ('verified', 'rejected')
        AND COALESCE(a.verified_at, a.rejected_at) BETWEEN a.finished_at AND a.finished_at + interval '120 seconds'
        AND COALESCE(a.verified_at, a.rejected_at) <= stamp) AS within_slo,
      count(*) FILTER (WHERE a.status IN ('verified', 'rejected')
        AND COALESCE(a.verified_at, a.rejected_at) BETWEEN a.finished_at AND stamp) AS samples,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (COALESCE(a.verified_at, a.rejected_at) -
  a.finished_at)) * 1000) FILTER (WHERE a.status IN ('verified', 'rejected')
        AND COALESCE(a.verified_at, a.rejected_at) BETWEEN a.finished_at AND stamp) AS p95
    FROM
      public.run_attempts a
    CROSS JOIN bounds b
  WHERE
    a.created_at <= stamp
    AND a.started_at <= stamp
    AND a.finished_at <= stamp
    AND a.finished_at >= b.lo
    AND a.finished_at < b.hi
    AND (f ->> 'engineVersion' IS NULL
      OR a.engine_version = f ->> 'engineVersion')
    AND (f ->> 'gameplayRulesetVersion' IS NULL
      OR a.gameplay_ruleset_version = (f ->> 'gameplayRulesetVersion')::integer)
    GROUP BY
      1
  ),
  buckets AS (
    SELECT
      at,
      jsonb_build_object('started', COALESCE(s.started, 0), 'verified', COALESCE(s.verified, 0),
  'rejected', COALESCE(s.rejected, 0), 'expired', COALESCE(s.expired, 0), 'pending',
  COALESCE(s.pending, 0), 'eligibleSeals', COALESCE(v.eligible, 0), 'withinSlo', COALESCE(v.within_slo, 0),
  'terminalSamples', COALESCE(v.samples, 0), 'sealToTerminalP95Ms', v.p95, 'sealToTerminalSli', CASE WHEN v.eligible > 0
  THEN
          v.within_slo::numeric / v.eligible
        END) AS m
    FROM
      bounds b
    CROSS JOIN LATERAL generate_series(b.lo, b.hi - b.step, b.step) at
    LEFT JOIN starts s USING (at)
    LEFT JOIN seals v USING (at)
  )
  SELECT
    jsonb_build_object('granularity', f ->> 'granularity', 'coverage', 'server_attempts_only', 'requestAvailability',
      NULL, 'requestLatencyP95Ms', NULL, 'summary', (
        SELECT
          private.diagnostic_service_metrics (f, stamp, lo, hi)
        FROM bounds), 'buckets', (
        SELECT
    jsonb_agg(m || jsonb_build_object('at', private.diagnostic_stamp (at), 'hasSignal', (m ->>
      'started')::bigint > 0
              OR (m ->> 'eligibleSeals')::bigint > 0
              OR (m ->> 'terminalSamples')::bigint > 0)
          ORDER BY at)
          FROM buckets), 'pendingBacklog', (
          SELECT
            count(*)
          FROM public.run_attempts a
      WHERE
        a.created_at <= stamp
        AND a.started_at <= stamp
        AND a.status = 'finished'
        AND a.finished_at < stamp - interval '5 minutes'
        AND (f ->> 'engineVersion' IS NULL
          OR a.engine_version = f ->> 'engineVersion')
        AND (f ->> 'gameplayRulesetVersion' IS NULL
          OR a.gameplay_ruleset_version = (f ->> 'gameplayRulesetVersion')::integer)))
$$;
CREATE FUNCTION private.admin_diagnostics(
  p_section text, p_filters jsonb, p_cursor jsonb, p_snapshot timestamptz, p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  stamp timestamptz := COALESCE(p_snapshot, statement_timestamp());
  f jsonb;
  keys text[];
  lo date;
  hi date;
  cursor_at timestamptz;
  cursor_id uuid;
  data jsonb;
  target public.run_attempts;
BEGIN
  -- Read the live registered database identity before filters or target lookup.
  -- User metadata and stale JWT admin claims never authorize this projection.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.players p JOIN auth.users u ON u.id = p.user_id
    WHERE p.user_id = auth.uid() AND p.is_admin AND NOT COALESCE(u.is_anonymous, FALSE)
  ) THEN
    RAISE EXCEPTION 'admin_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_section IS NULL OR p_section NOT IN ('logs', 'authority', 'service', 'correlation')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR NOT isfinite(stamp) OR stamp > statement_timestamp()
    OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'invalid_diagnostic_query' USING ERRCODE = '22023';
  END IF;
  keys := CASE p_section
    WHEN 'logs' THEN ARRAY['from', 'to', 'level', 'operation', 'correlationId', 'attemptId']
    WHEN 'authority' THEN ARRAY['from', 'to', 'engineVersion', 'gameplayRulesetVersion', 'status', 'rejectionCode']
    WHEN 'service' THEN ARRAY['from', 'to', 'engineVersion', 'gameplayRulesetVersion', 'granularity']
    ELSE ARRAY['from', 'to', 'attemptId']
  END;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_filters) k WHERE NOT k = ANY(keys)) THEN
    RAISE EXCEPTION 'invalid_diagnostic_filter' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_object_agg(k, COALESCE(p_filters -> k, 'null'::jsonb)) INTO f FROM unnest(keys) k;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(f) e
    WHERE e.value <> 'null'::jsonb
      AND jsonb_typeof(e.value) <> CASE WHEN e.key = 'gameplayRulesetVersion' THEN 'number' ELSE 'string' END
  ) THEN
    RAISE EXCEPTION 'invalid_diagnostic_filter' USING ERRCODE = '22023';
  END IF;
  lo := COALESCE((f ->> 'from')::date, (stamp AT TIME ZONE 'UTC')::date - 6);
  hi := COALESCE((f ->> 'to')::date, (stamp AT TIME ZONE 'UTC')::date);
  IF lo < date '0001-01-01' OR hi > date '9999-12-30' OR lo > hi OR hi - lo > 30
    OR (f ->> 'from' IS NOT NULL AND f ->> 'from' <> to_char(lo, 'YYYY-MM-DD'))
    OR (f ->> 'to' IS NOT NULL AND f ->> 'to' <> to_char(hi, 'YYYY-MM-DD'))
  THEN
    RAISE EXCEPTION 'invalid_diagnostic_period' USING ERRCODE = '22023';
  END IF;
  f := f || jsonb_build_object('from', to_char(lo, 'YYYY-MM-DD'), 'to', to_char(hi, 'YYYY-MM-DD'));
  IF (f ->> 'level' IS NOT NULL AND f ->> 'level' NOT IN ('debug', 'info', 'warn', 'error'))
    OR (f ->> 'operation' IS NOT NULL AND f ->> 'operation' NOT IN ('select', 'insert', 'update', 'upsert', 'delete', 'auth', 'other'))
    OR (f ->> 'status' IS NOT NULL AND f ->> 'status' NOT IN ('started', 'finished', 'verified', 'rejected', 'expired'))
    OR (f ->> 'engineVersion' IS NOT NULL AND f ->> 'engineVersion' !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
    OR (f ->> 'rejectionCode' IS NOT NULL AND f ->> 'rejectionCode' !~ '^[a-z][a-z0-9_]{0,63}$')
    OR (f ->> 'gameplayRulesetVersion' IS NOT NULL AND (
      f ->> 'gameplayRulesetVersion' !~ '^[1-9][0-9]{0,4}$' OR (f ->> 'gameplayRulesetVersion')::integer > 32767
    ))
    OR (f ->> 'granularity' IS NOT NULL AND f ->> 'granularity' NOT IN ('hour', 'day'))
  THEN
    RAISE EXCEPTION 'invalid_diagnostic_filter' USING ERRCODE = '22023';
  END IF;
  IF p_section = 'service' THEN
    f := f || jsonb_build_object('granularity', COALESCE(f ->> 'granularity', 'day'));
  END IF;
  IF (f ->> 'correlationId' IS NOT NULL AND f ->> 'correlationId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (f ->> 'attemptId' IS NOT NULL AND f ->> 'attemptId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (p_section = 'correlation' AND f ->> 'attemptId' IS NULL)
  THEN
    RAISE EXCEPTION 'invalid_diagnostic_identity' USING ERRCODE = '22023';
  END IF;
  IF f ->> 'correlationId' IS NOT NULL THEN
    f := jsonb_set(f, '{correlationId}', to_jsonb(((f ->> 'correlationId')::uuid)::text));
  END IF;
  IF f ->> 'attemptId' IS NOT NULL THEN
    f := jsonb_set(f, '{attemptId}', to_jsonb(((f ->> 'attemptId')::uuid)::text));
  END IF;
  IF p_cursor IS NOT NULL AND p_cursor <> 'null'::jsonb THEN
    IF p_section = 'service' OR p_snapshot IS NULL OR jsonb_typeof(p_cursor) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(p_cursor)) <> 2
      OR NOT p_cursor ?& ARRAY['at', 'id']
      OR jsonb_typeof(p_cursor -> 'at') <> 'string' OR jsonb_typeof(p_cursor -> 'id') <> 'string'
    THEN
      RAISE EXCEPTION 'invalid_diagnostic_cursor' USING ERRCODE = '22023';
    END IF;
    cursor_at := (p_cursor ->> 'at')::timestamptz;
    cursor_id := (p_cursor ->> 'id')::uuid;
    IF NOT isfinite(cursor_at) OR cursor_at > stamp
      OR private.diagnostic_stamp(cursor_at) <> p_cursor ->> 'at'
      OR cursor_at < (lo::timestamp AT TIME ZONE 'UTC')
      OR cursor_at >= ((hi + 1)::timestamp AT TIME ZONE 'UTC')
    THEN
      RAISE EXCEPTION 'invalid_diagnostic_cursor' USING ERRCODE = '22023';
    END IF;
  END IF;
  CASE p_section
    WHEN 'logs' THEN data := private.diagnostic_logs(f, stamp, cursor_at, cursor_id, p_limit);
    WHEN 'authority' THEN data := private.diagnostic_authority(f, stamp, cursor_at, cursor_id, p_limit);
    WHEN 'service' THEN data := private.diagnostic_service(f, stamp);
    ELSE
      SELECT * INTO target FROM public.run_attempts a
      WHERE a.id = (f ->> 'attemptId')::uuid AND a.created_at <= stamp AND a.started_at <= stamp;
      data := jsonb_build_object(
        'attempt', CASE WHEN target.id IS NOT NULL THEN private.diagnostic_attempt_item(target) END,
        'logs', private.diagnostic_logs(f, stamp, cursor_at, cursor_id, p_limit), 'linksComplete', FALSE
      );
  END CASE;
  RETURN jsonb_build_object('schemaVersion', 1, 'section', p_section,
    'snapshotAt', private.diagnostic_stamp(stamp), 'filters', f, 'data', data);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid_diagnostic_query' USING ERRCODE = '22023';
END $$;
CREATE FUNCTION public.admin_diagnostics (p_section text, p_filters jsonb DEFAULT '{}'::jsonb, p_cursor
  jsonb DEFAULT NULL, p_snapshot timestamptz DEFAULT NULL, p_limit integer DEFAULT 25)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_diagnostics (p_section, p_filters, p_cursor, p_snapshot, p_limit)
$$;
REVOKE ALL ON FUNCTION private.diagnostic_stamp (timestamptz), private.diagnostic_label (text),
  private.diagnostic_attempt_id (jsonb), private.diagnostic_log_item (public.logs), private.diagnostic_attempt_item
  (public.run_attempts), private.diagnostic_logs (jsonb, timestamptz, timestamptz, uuid, integer),
  private.diagnostic_authority (jsonb, timestamptz, timestamptz, uuid, integer), private.diagnostic_service_metrics
  (jsonb, timestamptz, timestamptz, timestamptz), private.diagnostic_service (jsonb, timestamptz),
  private.admin_diagnostics (text, jsonb, jsonb, timestamptz, integer), public.admin_diagnostics (text, jsonb, jsonb,
  timestamptz, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_diagnostics (text, jsonb, jsonb, timestamptz, integer),
  public.admin_diagnostics (text, jsonb, jsonb, timestamptz, integer) TO authenticated;
COMMENT ON FUNCTION public.admin_diagnostics (text, jsonb, jsonb, timestamptz, integer) IS 'Admin-only bounded diagnostics. Live statuses; snapshot bounds creation, not MVCC history. DB logging remains opt-in, no transport availability inferred, no raw payload or identities exposed.';
COMMIT;
