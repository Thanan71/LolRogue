-- ADM-S5: a single audited moderation command surface. Historical runs/results
-- remain untouched; only the daily leaderboard eligibility and report review
-- state change. Rejections return receipts so their audit is not rolled back.
BEGIN;
CREATE TABLE private.moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  daily_run_id uuid REFERENCES public.daily_runs (id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.daily_score_reports (id) ON DELETE SET NULL,
  request_id uuid,
  payload_hash text CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('invalidate_score', 'dismiss_report', 'access_denied', 'report')),
  outcome text NOT NULL CHECK (outcome IN ('applied', 'rejected')),
  code text NOT NULL CHECK (code ~ '^[a-z_]{3,50}$'),
  reason text CHECK (reason IS NULL OR (char_length(reason) BETWEEN 10 AND 500 AND reason !~ '[[:cntrl:]]')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_user_id, request_id)
);
CREATE INDEX moderation_events_target_order ON private.moderation_events (daily_run_id, occurred_at DESC, id DESC);
CREATE INDEX moderation_events_report ON private.moderation_events (report_id)
WHERE
  report_id IS NOT NULL;
CREATE INDEX moderation_events_retention ON private.moderation_events (occurred_at);
ALTER TABLE private.moderation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY moderation_events_api_deny ON private.moderation_events AS RESTRICTIVE
 FOR ALL TO anon,authenticated,service_role USING(FALSE) WITH CHECK(FALSE);
REVOKE ALL ON TABLE private.moderation_events FROM PUBLIC, anon, authenticated, service_role;
-- Preserve the existing decision evidence in the canonical private history.
-- UUID, actor and action timestamp are the original values, with no invented
-- request/idempotency key. Old free text is sanitized before becoming visible.
INSERT INTO private.moderation_events (id, actor_user_id, daily_run_id, action, outcome, code, reason, occurred_at)
SELECT
  a.id,
  a.actor_user_id,
  a.daily_run_id,
  'invalidate_score',
  'applied',
  'score_invalidated',
  CASE WHEN char_length(public.sanitize_log_text (a.reason, 500)) >= 10 THEN
    public.sanitize_log_text (a.reason, 500)
  ELSE
    '[REDACTED]'
  END,
  a.invalidated_at
FROM
  public.daily_score_invalidation_audit a;
REVOKE SELECT ON public.daily_score_reports, public.daily_score_invalidation_audit FROM authenticated;
CREATE TABLE private.moderation_rate_windows (
  actor_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('decision_minute', 'decision_day', 'report_minute', 'report_day',
    'denied_minute', 'report_rejected_minute', 'report_denied_minute')),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 0),
  rejection_audit_id uuid,
  PRIMARY KEY (actor_user_id, kind, window_start)
);
ALTER TABLE private.moderation_rate_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY moderation_rate_windows_api_deny ON private.moderation_rate_windows AS RESTRICTIVE
 FOR ALL TO anon,authenticated,service_role USING(FALSE) WITH CHECK(FALSE);
REVOKE ALL ON TABLE private.moderation_rate_windows FROM PUBLIC, anon, authenticated, service_role;
-- All-status stable ordering supports arbitrary old/101st reports. Existing
-- partial indexes only cover open reports or retention, not the complete queue.
CREATE INDEX daily_score_reports_status_order ON public.daily_score_reports (status, created_at, id);
REVOKE INSERT ON public.daily_score_reports FROM authenticated;
DROP POLICY "Daily score reports own insert" ON public.daily_score_reports;
DROP POLICY "Daily score reports admin read" ON public.daily_score_reports;
DROP POLICY "Daily score invalidation audit admin read" ON public.daily_score_invalidation_audit;
-- Legacy tables are server-only archives/sources. ACL revocation and an
-- explicit restrictive policy prevent accidental browser access from returning.
CREATE POLICY daily_score_reports_api_deny ON public.daily_score_reports AS RESTRICTIVE
 FOR ALL TO anon,authenticated,service_role USING(FALSE) WITH CHECK(FALSE);
CREATE POLICY daily_score_invalidation_audit_api_deny ON public.daily_score_invalidation_audit AS RESTRICTIVE
 FOR ALL TO anon,authenticated,service_role USING(FALSE) WITH CHECK(FALSE);
REVOKE ALL ON FUNCTION public.invalidate_daily_score (UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION private.moderation_take_limit (p_actor uuid, p_kind text, p_start timestamptz)
  RETURNS integer
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  INSERT INTO private.moderation_rate_windows (actor_user_id, kind, window_start, attempts)
    VALUES (p_actor, p_kind, p_start, 1)
  ON CONFLICT (actor_user_id, kind, window_start)
    DO UPDATE SET
      attempts = LEAST (private.moderation_rate_windows.attempts, 2147483646) + 1
    RETURNING
      attempts
$$;
CREATE FUNCTION private.moderation_abuse_event (p_actor uuid, p_kind text, p_start timestamptz, p_code text,
  p_action text)
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
DECLARE
  event_id uuid;
BEGIN
  SELECT
    rejection_audit_id
  INTO
    event_id
  FROM
    private.moderation_rate_windows
  WHERE
    actor_user_id = p_actor
    AND kind = p_kind
    AND window_start = p_start
  FOR UPDATE;
  IF event_id IS NULL THEN
    INSERT INTO private.moderation_events (actor_user_id, action, outcome, code)
      VALUES (p_actor, p_action, 'rejected', p_code)
    RETURNING
      id
    INTO
      event_id;
    UPDATE
      private.moderation_rate_windows
    SET
      rejection_audit_id = event_id
    WHERE
      actor_user_id = p_actor
      AND kind = p_kind
      AND window_start = p_start;
  END IF;
  RETURN event_id;
END;
$$;
CREATE FUNCTION private.moderation_receipt (e private.moderation_events, p_request uuid, p_replayed boolean
  DEFAULT FALSE)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    jsonb_build_object('outcome', CASE WHEN e.outcome = 'applied'
        AND p_replayed THEN
        'replayed'
      ELSE
        e.outcome
      END, 'code', e.code, 'requestId', p_request, 'auditId', e.id, 'reportId', CASE
	WHEN e.outcome = 'applied' THEN
        e.report_id
      END, 'dailyRunId', CASE WHEN e.outcome = 'applied' THEN
        e.daily_run_id
      END, 'action', CASE WHEN e.outcome = 'applied' THEN
        e.action
      END, 'occurredAt', e.occurred_at)
$$;
CREATE FUNCTION private.moderation_queue_data (p jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
DECLARE
  stamp timestamptz := COALESCE((p ->> 'p_snapshot')::timestamptz, statement_timestamp());
  wanted text := p ->> 'p_status';
  page_size integer := (p ->> 'p_limit')::integer;
  from_day date := (p ->> 'p_from')::date;
  to_day date := (p ->> 'p_to')::date;
  target_id uuid := (p ->> 'p_daily_run_id')::uuid;
  cursor_value jsonb := p -> 'p_cursor';
  cursor_at timestamptz;
  cursor_id uuid;
  result jsonb;
BEGIN
  IF wanted IS NULL OR wanted NOT IN ('open', 'resolved', 'dismissed') OR page_size IS NULL
    OR page_size NOT BETWEEN 1 AND 50 OR NOT isfinite(stamp) OR stamp > statement_timestamp() OR (from_day IS
    NOT NULL AND NOT isfinite(from_day)) OR (to_day IS NOT NULL AND NOT isfinite(to_day)) OR from_day >
    to_day THEN
    RAISE EXCEPTION 'invalid_moderation_query'
      USING ERRCODE = '22023';
  END IF;
  IF cursor_value IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(cursor_value) <> 'object' OR (
      SELECT
        count(*)
      FROM
        jsonb_object_keys(cursor_value)) <> 2 OR NOT cursor_value ?& ARRAY['createdAt', 'id'] THEN
      RAISE EXCEPTION 'invalid_moderation_cursor' USING ERRCODE = '22023';
END IF;
  cursor_at := (cursor_value ->> 'createdAt')::timestamptz;
  cursor_id := (cursor_value ->> 'id')::uuid;
  IF cursor_at IS NULL OR cursor_id IS NULL OR NOT isfinite(cursor_at) OR cursor_at > stamp THEN
    RAISE EXCEPTION 'invalid_moderation_cursor'
      USING ERRCODE = '22023';
  END IF;
END IF;
  WITH scoped AS NOT MATERIALIZED (
    SELECT
      r.*,
      CASE r.status
      WHEN 'actioned' THEN
        'resolved'
      ELSE
        r.status
      END AS visible_status
    FROM
      public.daily_score_reports r
    WHERE
      r.created_at <= stamp
      AND (
        from_day IS NULL
        OR r.created_at >= from_day::timestamp AT TIME ZONE 'UTC'
      )
      AND (
        to_day IS NULL
        OR r.created_at < (
          to_day + 1
        )::timestamp AT TIME ZONE 'UTC'
      )
      AND (
        target_id IS NULL
        OR r.daily_run_id = target_id
      )
  ),
  selected AS MATERIALIZED (
    SELECT
      r.*
    FROM
      scoped r
    WHERE
      r.status = CASE wanted WHEN 'resolved' THEN 'actioned' ELSE wanted END
      AND (
        cursor_at IS NULL
        OR (
          r.created_at,
          r.id
        ) > (
          cursor_at,
          cursor_id
        )
      )
    ORDER BY
      r.created_at,
      r.id
    LIMIT page_size + 1
),
page AS MATERIALIZED (
  SELECT
    *
  FROM
    selected
  ORDER BY
    created_at,
    id
  LIMIT page_size
)
SELECT
  jsonb_build_object('snapshotAt', stamp, 'status', wanted, 'total', (
      SELECT
        count(*)
      FROM scoped
    WHERE
      status = CASE wanted WHEN 'resolved' THEN 'actioned' ELSE wanted END), 'counts', jsonb_build_object('open', (
        SELECT
          count(*)
        FROM scoped
      WHERE
        status = 'open'), 'resolved', (
        SELECT
          count(*)
        FROM scoped
      WHERE
        status = 'actioned'), 'dismissed', (
        SELECT
          count(*)
        FROM scoped
      WHERE
        status = 'dismissed')), 'rows', COALESCE((
      SELECT
	jsonb_agg(jsonb_build_object('reportId', r.id, 'dailyRunId', r.daily_run_id, 'reason',
	  public.sanitize_log_text (r.reason, 500), 'createdAt', r.created_at, 'status',
	  r.visible_status, 'reviewedAt', r.reviewed_at, 'reportsForScore', (
            SELECT
              count(*)
            FROM public.daily_score_reports x
          WHERE
            x.daily_run_id = r.daily_run_id
	    AND x.created_at <= stamp), 'target', jsonb_build_object('dailyDate', d.daily_date,
	      'score', d.score, 'completedAt', d.completed_at, 'invalidatedAt', d.invalidated_at,
	      'scoreVersion', d.score_version, 'gameplayRulesetVersion', d.gameplay_ruleset_version, 'dailyRulesetVersion',
	      d.daily_ruleset_version))
      ORDER BY r.created_at, r.id)
      FROM page r
      JOIN public.daily_runs d ON d.id = r.daily_run_id), '[]'::jsonb), 'nextCursor', CASE WHEN (
    SELECT
      count(*)
    FROM selected) > page_size THEN
  (
    SELECT
      jsonb_build_object('createdAt', created_at, 'id', id)
    FROM page ORDER BY created_at DESC, id DESC LIMIT 1)
  END)
INTO
  result;
  RETURN result;
END;
$$;
CREATE FUNCTION private.moderation_history_data (p jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
DECLARE
  stamp timestamptz := COALESCE((p ->> 'p_snapshot')::timestamptz, statement_timestamp());
  target_id uuid := (p ->> 'p_daily_run_id')::uuid;
  page_size integer := (p ->> 'p_limit')::integer;
  cursor_value jsonb := p -> 'p_cursor';
  cursor_at timestamptz;
  cursor_id uuid;
  result jsonb;
BEGIN
  IF target_id IS NULL OR page_size IS NULL OR page_size NOT BETWEEN 1 AND 50 OR NOT isfinite(stamp) OR stamp
    > statement_timestamp() THEN
    RAISE EXCEPTION 'invalid_moderation_query'
      USING ERRCODE = '22023';
  END IF;
  IF cursor_value IS DISTINCT FROM 'null'::jsonb THEN
    IF jsonb_typeof(cursor_value) <> 'object' OR (
      SELECT
        count(*)
      FROM
        jsonb_object_keys(cursor_value)) <> 2 OR NOT cursor_value ?& ARRAY['occurredAt', 'id'] THEN
      RAISE EXCEPTION 'invalid_moderation_cursor' USING ERRCODE = '22023';
END IF;
  cursor_at := (cursor_value ->> 'occurredAt')::timestamptz;
  cursor_id := (cursor_value ->> 'id')::uuid;
  IF cursor_at IS NULL OR cursor_id IS NULL OR NOT isfinite(cursor_at) OR cursor_at > stamp THEN
    RAISE EXCEPTION 'invalid_moderation_cursor'
      USING ERRCODE = '22023';
  END IF;
END IF;
  WITH scoped AS MATERIALIZED (
    SELECT
      *
    FROM
      private.moderation_events
    WHERE
      daily_run_id = target_id
      AND occurred_at <= stamp
  ),
  selected AS MATERIALIZED (
    SELECT
      *
    FROM
      scoped
    WHERE
      cursor_at IS NULL
      OR (
        occurred_at,
        id
      ) < (
        cursor_at,
        cursor_id
      )
    ORDER BY
      occurred_at DESC,
      id DESC
    LIMIT page_size + 1
),
page AS MATERIALIZED (
  SELECT
    *
  FROM
    selected
  ORDER BY
    occurred_at DESC,
    id DESC
  LIMIT page_size
)
SELECT
  jsonb_build_object('snapshotAt', stamp, 'dailyRunId', target_id, 'total', (
      SELECT
        count(*)
      FROM scoped), 'rows', COALESCE((
      SELECT
	jsonb_agg(jsonb_build_object('id', id, 'actorId', actor_user_id, 'action',
	  action, 'reason', CASE WHEN reason IS NOT NULL THEN
              public.sanitize_log_text (reason, 500)
            END, 'outcome', outcome, 'code', code, 'occurredAt', occurred_at, 'reportId', report_id)
        ORDER BY occurred_at DESC, id DESC)
        FROM page), '[]'::jsonb), 'nextCursor', CASE WHEN (
      SELECT
        count(*)
      FROM selected) > page_size THEN
    (
      SELECT
        jsonb_build_object('occurredAt', occurred_at, 'id', id)
      FROM page ORDER BY occurred_at, id LIMIT 1)
    END)
INTO
  result;
  RETURN result;
END;
$$;
CREATE FUNCTION private.moderation_decide_data (p_actor uuid, p jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  << decision_command >>
DECLARE
  request_id uuid := (p ->> 'p_request_id')::uuid;
  selected_report uuid := (p ->> 'p_report_id')::uuid;
  confirmed_target uuid := (p ->> 'p_confirmed_daily_run_id')::uuid;
  confirmed_date date := (p ->> 'p_confirmed_daily_date')::date;
  action_name text := p ->> 'p_action';
  reason_value text := regexp_replace(btrim(COALESCE(p ->> 'p_reason', '')), '[[:space:]]+',
    ' ', 'g');
  fingerprint text := encode(extensions.digest(convert_to(p::text, 'UTF8'), 'sha256'), 'hex');
  previous private.moderation_events%ROWTYPE;
  event_row private.moderation_events%ROWTYPE;
  report_row public.daily_score_reports%ROWTYPE;
  target_row public.daily_runs%ROWTYPE;
  rejection_code text;
  moment timestamptz := clock_timestamp();
  minute_start timestamptz := date_trunc('minute', statement_timestamp());
  minute_count integer;
  day_count integer;
  event_id uuid;
BEGIN
  -- Actor lock orders same-key concurrent retries before consuming quota.
  PERFORM
    pg_advisory_xact_lock(hashtextextended('moderation:' || p_actor::text, 0));
    SELECT
      *
    INTO
      previous
    FROM
      private.moderation_events
    WHERE
      actor_user_id = p_actor
      AND moderation_events.request_id = decision_command.request_id;
      IF FOUND THEN
        IF previous.payload_hash = fingerprint THEN
          -- Account erasure may remove the report FK while the immutable command
          -- remains. Reconstruct only the already hash-verified receipt context.
          previous.report_id := COALESCE(previous.report_id, selected_report);
          RETURN private.moderation_receipt (previous, request_id, TRUE);
        END IF;
        rejection_code := 'request_conflict';
      END IF;
      minute_count := private.moderation_take_limit (p_actor, 'decision_minute', minute_start);
      day_count := private.moderation_take_limit (p_actor, 'decision_day', date_trunc('day',
	statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
      IF minute_count > 10 OR day_count > 100 THEN
        event_id := private.moderation_abuse_event (p_actor, 'decision_minute', minute_start, 'rate_limited', 'access_denied');
        SELECT
          *
        INTO
          event_row
        FROM
          private.moderation_events
        WHERE
          id = event_id;
          RETURN private.moderation_receipt (event_row, request_id);
      END IF;
      IF rejection_code IS NULL THEN
	IF request_id IS NULL OR selected_report IS NULL OR action_name IS NULL OR action_name NOT IN
	  ('invalidate_score', 'dismiss_report') OR p ->> 'p_scope' IS DISTINCT FROM 'daily_score'
	  THEN
          rejection_code := 'invalid_request';
        ELSIF char_length(reason_value)
          NOT BETWEEN 10 AND 500
            OR reason_value ~ '[[:cntrl:]]'
            OR octet_length(COALESCE(p ->> 'p_reason', '')) > 4000 THEN
            rejection_code := 'invalid_reason';
          ELSIF confirmed_target IS NULL
            OR confirmed_date IS NULL
            OR NOT isfinite(confirmed_date) THEN
            rejection_code := 'invalid_confirmation';
          ELSE
            SELECT
              *
            INTO
              report_row
            FROM
              public.daily_score_reports
            WHERE
              id = selected_report;
              IF NOT FOUND THEN
                rejection_code := 'report_not_found';
              ELSE
                SELECT
                  *
                INTO
                  target_row
                FROM
                  public.daily_runs
                WHERE
                  id = report_row.daily_run_id
                FOR UPDATE;
                SELECT
                  *
                INTO
                  report_row
                FROM
                  public.daily_score_reports
                WHERE
                  id = selected_report
                FOR UPDATE;
                IF NOT FOUND THEN
                  rejection_code := 'report_not_found';
                ELSIF report_row.daily_run_id <> confirmed_target THEN
                  rejection_code := 'target_mismatch';
                ELSIF target_row.daily_date <> confirmed_date THEN
                  rejection_code := 'period_mismatch';
                ELSIF report_row.status <> 'open' THEN
                  rejection_code := 'report_not_open';
                ELSIF target_row.completed_at IS NULL THEN
                  rejection_code := 'score_not_completed';
                ELSIF action_name = 'invalidate_score'
                    AND target_row.invalidated_at IS NOT NULL THEN
                    rejection_code := 'score_already_invalidated';
                END IF;
              END IF;
        END IF;
      END IF;
      IF rejection_code IS NOT NULL THEN
	INSERT INTO private.moderation_events (actor_user_id, daily_run_id, report_id, request_id,
	  payload_hash, action, outcome, code)
          VALUES (p_actor, target_row.id, report_row.id, CASE WHEN previous.id IS NULL THEN
              request_id
            END, CASE WHEN previous.id IS NULL THEN
              fingerprint
            END, CASE WHEN action_name IN ('invalidate_score', 'dismiss_report') THEN
              action_name
            ELSE
              'access_denied'
            END, 'rejected', rejection_code)
        RETURNING
          *
        INTO
          event_row;
          RETURN private.moderation_receipt (event_row, request_id);
      END IF;
      -- Store only sanitized human justification, never arbitrary tokens or email.
      reason_value := public.sanitize_log_text (reason_value, 500);
      IF char_length(reason_value) < 10 THEN
        reason_value := '[REDACTED]';
      END IF;
      IF action_name = 'invalidate_score' THEN
        UPDATE
          public.daily_runs
        SET
          invalidated_at = moment,
          invalidation_reason = reason_value,
          invalidated_by = p_actor
        WHERE
          id = target_row.id;

        -- New decisions have one canonical private audit; the old table is archived.
          UPDATE
            public.daily_score_reports
          SET
            status = 'actioned',
            reviewed_by = p_actor,
            reviewed_at = moment
          WHERE
            daily_run_id = target_row.id
            AND status = 'open';
          ELSE
            UPDATE
              public.daily_score_reports
            SET
              status = 'dismissed',
              reviewed_by = p_actor,
              reviewed_at = moment
            WHERE
              id = report_row.id;
      END IF;
  INSERT INTO private.moderation_events (actor_user_id, daily_run_id, report_id, request_id, payload_hash,
    action, outcome, code, reason, occurred_at)
    VALUES (p_actor, target_row.id, report_row.id, request_id, fingerprint, action_name, 'applied',
      CASE WHEN action_name = 'invalidate_score' THEN
        'score_invalidated'
      ELSE
        'report_dismissed'
      END, reason_value, moment)
  RETURNING
    *
  INTO
    event_row;
    RETURN private.moderation_receipt (event_row, request_id);
END;
$$;
CREATE FUNCTION private.admin_moderation (p_resource text, p_input jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  actor uuid := (
    SELECT
      auth.uid ());
  permitted boolean;
  minute_start timestamptz := date_trunc('minute', statement_timestamp());
  event_id uuid;
  event_row private.moderation_events%ROWTYPE;
BEGIN
  -- Share locks serialize role revocation/account erasure with this command.
  SELECT
    p.is_admin
    AND NOT COALESCE(u.is_anonymous, FALSE)
  INTO
    permitted
  FROM
    public.players p
    JOIN auth.users u ON u.id = p.user_id
  WHERE
    p.user_id = actor FOR SHARE OF p, u;
  permitted := COALESCE(permitted, FALSE);
  IF actor IS NULL OR NOT permitted THEN
    IF p_resource = 'decide' AND actor IS NOT NULL AND EXISTS (
      SELECT
        1
      FROM
        auth.users
      WHERE
        id = actor) THEN
      PERFORM private.moderation_take_limit (actor, 'denied_minute', minute_start);
      event_id := private.moderation_abuse_event (actor, 'denied_minute', minute_start, 'admin_access_denied', 'access_denied');
      SELECT
        *
      INTO
        event_row
      FROM
        private.moderation_events
      WHERE
        id = event_id;
      RETURN private.moderation_receipt (event_row, (p_input ->> 'p_request_id')::uuid);
    END IF;
    RAISE EXCEPTION 'admin_access_denied'
      USING ERRCODE = '42501';
  END IF;
  CASE p_resource
  WHEN 'queue' THEN
    RETURN private.moderation_queue_data (p_input);
  WHEN 'history' THEN
    RETURN private.moderation_history_data (p_input);
  WHEN 'decide' THEN
    RETURN private.moderation_decide_data (actor, p_input);
  ELSE
    RAISE EXCEPTION 'invalid_moderation_resource'
    USING ERRCODE = '22023';
  END CASE;
END;
$$;
CREATE FUNCTION public.admin_moderation_queue (p_status text DEFAULT 'open', p_limit integer
  DEFAULT 25, p_cursor jsonb DEFAULT NULL, p_snapshot timestamptz DEFAULT NULL, p_from date DEFAULT NULL,
  p_to date DEFAULT NULL, p_daily_run_id uuid DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_moderation ('queue', jsonb_build_object('p_status', p_status,
      'p_limit', p_limit, 'p_cursor', p_cursor, 'p_snapshot', p_snapshot, 'p_from',
      p_from, 'p_to', p_to, 'p_daily_run_id', p_daily_run_id))
$$;
CREATE FUNCTION public.admin_moderation_history (p_daily_run_id uuid, p_limit integer DEFAULT 25, p_cursor
  jsonb DEFAULT NULL, p_snapshot timestamptz DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_moderation ('history', jsonb_build_object('p_daily_run_id', p_daily_run_id,
      'p_limit', p_limit, 'p_cursor', p_cursor, 'p_snapshot', p_snapshot))
$$;
CREATE FUNCTION public.admin_moderation_decide (p_request_id uuid, p_report_id uuid, p_confirmed_daily_run_id
  uuid, p_confirmed_daily_date date, p_action text, p_reason text, p_scope text)
  RETURNS jsonb
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_moderation ('decide', jsonb_build_object('p_request_id', p_request_id,
      'p_report_id', p_report_id, 'p_confirmed_daily_run_id', p_confirmed_daily_run_id, 'p_confirmed_daily_date',
      p_confirmed_daily_date, 'p_action', p_action, 'p_reason', p_reason, 'p_scope',
      p_scope))
$$;
CREATE FUNCTION private.report_daily_score (p_daily_run_id uuid, p_reason text)
  RETURNS VOID
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  actor uuid := (
    SELECT
      auth.uid ());
  minute_start timestamptz := date_trunc('minute', statement_timestamp());
  count_min integer;
  count_day integer;
  reason_value text;
  is_anonymous_actor boolean;
BEGIN
  SELECT
    is_anonymous
  INTO
    is_anonymous_actor
  FROM
    auth.users
  WHERE
    id = actor;
  IF actor IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'authentication_required'
      USING ERRCODE = '42501';
  END IF;
  PERFORM
    pg_advisory_xact_lock(hashtextextended('report:' || actor::text, 0));
  IF COALESCE(is_anonymous_actor, FALSE) THEN
    PERFORM
      private.moderation_take_limit (actor, 'report_denied_minute', minute_start);
    PERFORM
      private.moderation_abuse_event (actor, 'report_denied_minute', minute_start, 'admin_access_denied', 'report');
    PERFORM
      set_config('response.status', '403', TRUE);
    RETURN;
  END IF;
  -- Duplicates preserve the original ID, creation date and review outcome.
  -- They do not consume quota, including after dismissal/invalidation.
  IF EXISTS (
    SELECT
      1
    FROM
      public.daily_score_reports
    WHERE
      daily_run_id = p_daily_run_id
      AND reporter_user_id = actor) THEN
    RETURN;
  END IF;
  count_min := private.moderation_take_limit (actor, 'report_minute', minute_start);
  count_day := private.moderation_take_limit (actor, 'report_day', date_trunc('day',
    statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  IF count_min > 5 OR count_day > 20 THEN
    PERFORM
      private.moderation_abuse_event (actor, 'report_minute', minute_start, 'rate_limited', 'report');
    -- PostgREST status/header GUCs return an HTTP rejection without raising a
    -- PostgreSQL exception: the limiter and abuse audit commit together.
    PERFORM
      set_config('response.status', '429', TRUE);
    PERFORM
      set_config('response.headers', '[{"Retry-After":"60"},{"X-Moderation-Rejected":"rate_limited"}]', TRUE);
    RETURN;
  END IF;
  reason_value := regexp_replace(btrim(COALESCE(p_reason, '')), '[[:space:]]+', ' ',
    'g');
  IF char_length(reason_value)
    NOT BETWEEN 10 AND 500 OR reason_value ~ '[[:cntrl:]]' OR octet_length(COALESCE(p_reason, '')) > 4000 THEN
    PERFORM
      private.moderation_take_limit (actor, 'report_rejected_minute', minute_start);
    PERFORM
      private.moderation_abuse_event (actor, 'report_rejected_minute', minute_start, 'invalid_request', 'report');
    PERFORM
      set_config('response.status', '400', TRUE);
    RETURN;
  END IF;
  -- Serialize score eligibility with an invalidation before inserting a report.
  PERFORM
    1
  FROM
    public.daily_runs d
    JOIN public.players p ON p.id = d.player_id
  WHERE
    d.id = p_daily_run_id
    AND d.completed_at IS NOT NULL
    AND d.invalidated_at IS NULL
    AND NOT p.leaderboard_opt_out
  FOR UPDATE
    OF d;
  IF NOT FOUND THEN
    PERFORM
      private.moderation_take_limit (actor, 'report_rejected_minute', minute_start);
    PERFORM
      private.moderation_abuse_event (actor, 'report_rejected_minute', minute_start, 'invalid_request', 'report');
    PERFORM
      set_config('response.status', '400', TRUE);
    RETURN;
  END IF;
  reason_value := public.sanitize_log_text (reason_value, 500);
  IF char_length(reason_value) < 10 THEN
    reason_value := '[REDACTED]';
  END IF;
  INSERT INTO public.daily_score_reports (daily_run_id, reporter_user_id, reason)
    VALUES (p_daily_run_id, actor, reason_value)
  ON CONFLICT (daily_run_id, reporter_user_id)
    DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.report_daily_score (p_daily_run_id uuid, p_reason text)
  RETURNS VOID
  LANGUAGE sql
  VOLATILE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.report_daily_score (p_daily_run_id, p_reason)
$$;
REVOKE ALL ON FUNCTION private.moderation_take_limit (UUID, TEXT, TIMESTAMPTZ),
  private.moderation_abuse_event (UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT), private.moderation_receipt
  (private.moderation_events, UUID, BOOLEAN), private.moderation_queue_data (JSONB),
  private.moderation_history_data (JSONB), private.moderation_decide_data (UUID, JSONB),
  private.admin_moderation (TEXT, JSONB), private.report_daily_score (UUID, TEXT),
  public.admin_moderation_queue (TEXT, INTEGER, JSONB, TIMESTAMPTZ, DATE, DATE, UUID),
  public.admin_moderation_history (UUID, INTEGER, JSONB, TIMESTAMPTZ), public.admin_moderation_decide (UUID,
  UUID, UUID, DATE, TEXT, TEXT, TEXT), public.report_daily_score (UUID, TEXT) FROM PUBLIC, anon,
  authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.admin_moderation (TEXT, JSONB), private.report_daily_score (UUID, TEXT),
  public.admin_moderation_queue (TEXT, INTEGER, JSONB, TIMESTAMPTZ, DATE, DATE, UUID),
  public.admin_moderation_history (UUID, INTEGER, JSONB, TIMESTAMPTZ), public.admin_moderation_decide (UUID,
  UUID, UUID, DATE, TEXT, TEXT, TEXT), public.report_daily_score (UUID, TEXT) TO authenticated;
-- Existing owner-only monthly cron and service-role maintenance entrypoint keep
-- one retention job. Open reports are never silently aged out. Counts include
-- physical removals only, not reason redactions on the daily eligibility row.
CREATE OR REPLACE FUNCTION private.purge_expired_social_data ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  started timestamptz := clock_timestamp();
  removed integer := 0;
  affected integer;
BEGIN
  PERFORM
    pg_advisory_xact_lock(hashtextextended('lolrogue-purge-expired-social-data', 0));
  DELETE FROM private.moderation_events
  -- One fixed cutoff makes expiry deterministic and permits a selective
  -- retention-index range scan. Applied decisions outlive rejected attempts.
  WHERE occurred_at < started - INTERVAL '30 days'
    AND (outcome='rejected' OR occurred_at < started - INTERVAL '365 days');
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := removed + affected;
  DELETE FROM private.moderation_rate_windows
  WHERE window_start < clock_timestamp() - INTERVAL '30 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := removed + affected;
  DELETE FROM public.daily_score_reports
  WHERE status IN ('dismissed', 'actioned')
    AND reviewed_at < clock_timestamp() - INTERVAL '365 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := removed + affected;
  DELETE FROM public.daily_score_invalidation_audit
  WHERE created_at < clock_timestamp() - INTERVAL '365 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  removed := removed + affected;
  UPDATE
    public.daily_runs
  SET
    invalidation_reason = 'Moderation retention period elapsed',
    invalidated_by = NULL
  WHERE
    invalidated_at < clock_timestamp() - INTERVAL '365 days'
    AND (invalidation_reason IS DISTINCT FROM 'Moderation retention period elapsed'
      OR invalidated_by IS NOT NULL);
  INSERT INTO private.social_retention_metrics (job_name, last_started_at, last_completed_at,
    last_deleted_rows, total_runs, total_deleted_rows)
    VALUES ('lolrogue-purge-expired-social-data', started, clock_timestamp(), removed, 1, removed)
  ON CONFLICT (job_name)
    DO UPDATE SET
      last_started_at = EXCLUDED.last_started_at,
      last_completed_at = EXCLUDED.last_completed_at,
      last_deleted_rows = EXCLUDED.last_deleted_rows,
      total_runs = private.social_retention_metrics.total_runs + 1,
      total_deleted_rows = private.social_retention_metrics.total_deleted_rows + EXCLUDED.last_deleted_rows;
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION private.purge_expired_social_data () FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE private.moderation_events IS 'Owner-only append-only API decisions/rejections: sanitized justification; decisions 365 days, rejected events 30 days; actor anonymized and target cascaded on account erasure. No client export.';
COMMENT ON TABLE private.moderation_rate_windows IS 'Owner-only bounded counters; 10 new admin commands/minute and 100/day UTC; reporting 5/minute and 20/day. One immutable abuse event per actor/window; counters retain 30 days.';
COMMENT ON FUNCTION public.invalidate_daily_score (UUID, TEXT) IS 'Owner-only historical compatibility function. Browser moderation must use confirmed, idempotent admin_moderation_decide.';
-- Reuse the existing named job; daily execution makes 30/365-day expiry
-- effective at the next scheduled purge, without creating a second job.
SELECT
  cron.schedule ('lolrogue-purge-expired-social-data', '43 4 * * *', 'SELECT private.purge_expired_social_data()');
COMMIT;
