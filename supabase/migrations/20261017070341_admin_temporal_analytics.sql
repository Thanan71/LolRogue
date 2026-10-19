-- ADM-S3: read-only retained-data aggregates. No browser events or gameplay changes.
BEGIN;
-- Measured on 20,000 retained attempts: these time-leading indexes avoid scanning
-- historical dimension/player indexes for an unsegmented one-day series window.
CREATE INDEX run_attempts_analytics_started_at ON public.run_attempts(started_at);
CREATE INDEX run_attempts_analytics_verified_at ON public.run_attempts(verified_at)
 WHERE status='verified' AND result_run_id IS NOT NULL;
CREATE TABLE private.admin_analytics_coverage (
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
 started_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);
INSERT INTO private.admin_analytics_coverage(singleton) VALUES(TRUE) ON CONFLICT DO NOTHING;
ALTER TABLE private.admin_analytics_coverage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.admin_analytics_coverage FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.preserve_admin_analytics_coverage() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'admin_analytics_coverage_immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER admin_analytics_coverage_immutable BEFORE UPDATE OR DELETE ON private.admin_analytics_coverage
FOR EACH ROW EXECUTE FUNCTION private.preserve_admin_analytics_coverage();

CREATE FUNCTION private.admin_analytics_timestamp(value TIMESTAMPTZ) RETURNS TEXT
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_char(value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;
CREATE FUNCTION private.admin_analytics_count(value BIGINT) RETURNS BIGINT
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF value<0 OR value>9007199254740991 THEN RAISE EXCEPTION 'admin_analytics_count_out_of_range' USING ERRCODE='22003'; END IF;
 RETURN value;
END $$;
CREATE FUNCTION private.admin_analytics_filters(p_filters JSONB,p_resource TEXT,stamp TIMESTAMPTZ) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f JSONB:=p_filters; k TEXT; d DATE; first_day DATE; last_day DATE; n NUMERIC;
BEGIN
 IF f IS NULL OR jsonb_typeof(f)<>'object' OR octet_length(f::TEXT)>4096 THEN RAISE EXCEPTION 'admin_analytics_invalid_filters' USING ERRCODE='22023'; END IF;
 IF NOT f?&ARRAY['from','to'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(f)keys(key) WHERE keys.key NOT IN
 ('from','to','granularity','engineVersion','gameplayVersion','progressionVersion','commandVersion','contentHash','mode','difficulty','accountAge'))
 OR (p_resource<>'series' AND f?'granularity') THEN RAISE EXCEPTION 'admin_analytics_invalid_filters' USING ERRCODE='22023'; END IF;
 FOR k IN SELECT jsonb_object_keys(f) LOOP
  IF k IN ('gameplayVersion','progressionVersion','commandVersion') THEN
   IF jsonb_typeof(f->k)<>'number' THEN RAISE EXCEPTION 'admin_analytics_invalid_version' USING ERRCODE='22023'; END IF;
   n:=(f->>k)::NUMERIC;
   IF n<1 OR n>32767 OR n<>trunc(n) THEN RAISE EXCEPTION 'admin_analytics_invalid_version' USING ERRCODE='22023'; END IF;
  ELSE
   IF jsonb_typeof(f->k)<>'string' OR length(f->>k)>100 THEN RAISE EXCEPTION 'admin_analytics_invalid_text' USING ERRCODE='22023'; END IF;
   IF k IN ('from','to') THEN
    IF f->>k !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'admin_analytics_invalid_date' USING ERRCODE='22023'; END IF;
    d:=(f->>k)::DATE;
    IF to_char(d,'YYYY-MM-DD')<>f->>k THEN RAISE EXCEPTION 'admin_analytics_invalid_date' USING ERRCODE='22023'; END IF;
   ELSIF k='granularity' AND f->>k NOT IN ('day','week') OR k='mode' AND f->>k NOT IN ('all','normal','daily')
    OR k='difficulty' AND f->>k NOT IN ('all','easy','normal','hard') OR k='accountAge' AND f->>k NOT IN ('all','new','existing')
    OR k='engineVersion' AND f->>k !~ '^[a-z0-9][a-z0-9_.-]{2,63}$'
    OR k='contentHash' AND f->>k !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'admin_analytics_invalid_enum' USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 first_day:=(f->>'from')::DATE;last_day:=(f->>'to')::DATE;
 IF last_day<first_day OR last_day-first_day>365 OR last_day>(stamp AT TIME ZONE 'UTC')::DATE THEN
 RAISE EXCEPTION 'admin_analytics_invalid_window' USING ERRCODE='22023'; END IF;
 RETURN f||jsonb_build_object('accountAge',COALESCE(f->>'accountAge','all'));
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN
 RAISE EXCEPTION 'admin_analytics_invalid_filters' USING ERRCODE='22023';
END $$;
CREATE FUNCTION private.admin_analytics_segment(a public.run_attempts) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN a.id IS NULL THEN jsonb_build_object('id','unassigned','engineVersion',NULL,'gameplayVersion',NULL,'progressionVersion',NULL,'commandVersion',NULL,'contentHash',NULL,'mode',NULL,'difficulty',NULL)
 ELSE jsonb_build_object('id',md5(concat_ws('|',a.engine_version,a.gameplay_ruleset_version,a.ruleset_version,a.command_schema_version,a.gameplay_content_hash,a.mode,a.difficulty)),
 'engineVersion',a.engine_version,'gameplayVersion',a.gameplay_ruleset_version,'progressionVersion',a.ruleset_version,'commandVersion',a.command_schema_version,
 'contentHash',a.gameplay_content_hash,'mode',a.mode,'difficulty',a.difficulty) END
$$;
CREATE FUNCTION private.admin_analytics_match(a public.run_attempts,f JSONB) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (NOT f?'engineVersion' OR a.engine_version=f->>'engineVersion')
 AND(NOT f?'gameplayVersion' OR a.gameplay_ruleset_version=(f->>'gameplayVersion')::INTEGER)
 AND(NOT f?'progressionVersion' OR a.ruleset_version=(f->>'progressionVersion')::INTEGER)
 AND(NOT f?'commandVersion' OR a.command_schema_version=(f->>'commandVersion')::INTEGER)
 AND(NOT f?'contentHash' OR a.gameplay_content_hash=f->>'contentHash')
 AND(COALESCE(f->>'mode','all')='all' OR a.mode=f->>'mode')
 AND(COALESCE(f->>'difficulty','all')='all' OR a.difficulty=f->>'difficulty')
$$;
CREATE FUNCTION private.admin_analytics_age(signup TIMESTAMPTZ,event_at TIMESTAMPTZ,f JSONB) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(f->>'accountAge','all')='all' OR CASE WHEN event_at IS NULL THEN FALSE
 WHEN f->>'accountAge'='new' THEN (event_at AT TIME ZONE 'UTC')::DATE=(signup AT TIME ZONE 'UTC')::DATE
 ELSE (event_at AT TIME ZONE 'UTC')::DATE>(signup AT TIME ZONE 'UTC')::DATE END
$$;
CREATE FUNCTION private.admin_analytics_attempts(stamp TIMESTAMPTZ,lo TIMESTAMPTZ,hi TIMESTAMPTZ)
RETURNS TABLE(player_id UUID,signup_at TIMESTAMPTZ,attempt public.run_attempts)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p.id,p.created_at,a FROM public.players p JOIN auth.users u ON u.id=p.user_id JOIN public.run_attempts a ON a.player_id=p.id
 WHERE NOT COALESCE(u.is_anonymous,FALSE) AND p.created_at<=stamp AND a.created_at<=stamp AND a.started_at BETWEEN p.created_at AND stamp AND a.started_at>=lo AND a.started_at<hi
$$;
CREATE FUNCTION private.admin_analytics_enrollment(f JSONB,stamp TIMESTAMPTZ)
RETURNS TABLE(player_id UUID,signup_at TIMESTAMPTZ,attempt public.run_attempts,segment JSONB)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p.id,p.created_at,v.attempt,private.admin_analytics_segment(v.attempt)
 FROM public.players p JOIN auth.users u ON u.id=p.user_id
 LEFT JOIN LATERAL(SELECT a AS attempt FROM public.run_attempts a WHERE a.player_id=p.id
 AND a.created_at<=stamp AND a.started_at BETWEEN p.created_at AND stamp ORDER BY a.started_at,a.id LIMIT 1)v ON TRUE
 WHERE NOT COALESCE(u.is_anonymous,FALSE) AND p.created_at<=stamp
 AND p.created_at>=((f->>'from')::DATE::TIMESTAMP AT TIME ZONE 'UTC') AND p.created_at<(((f->>'to')::DATE+1)::TIMESTAMP AT TIME ZONE 'UTC')
 AND private.admin_analytics_match(v.attempt,f) AND private.admin_analytics_age(p.created_at,(v.attempt).started_at,f)
$$;
CREATE FUNCTION private.admin_analytics_bounds(raw_start TIMESTAMPTZ,raw_end TIMESTAMPTZ,from_at TIMESTAMPTZ,to_at TIMESTAMPTZ,stamp TIMESTAMPTZ,marker TIMESTAMPTZ)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('bucketStartAt',private.admin_analytics_timestamp(GREATEST(raw_start,from_at)),
 'bucketEndAt',private.admin_analytics_timestamp(LEAST(raw_end,to_at)),
 'observedEndAt',private.admin_analytics_timestamp(LEAST(raw_end,to_at,stamp)),
 'isPartial',raw_start<from_at OR raw_end>to_at OR stamp<LEAST(raw_end,to_at),
 'sourceCoverage',CASE WHEN LEAST(raw_end,to_at,stamp)<=marker THEN 'unknown' WHEN GREATEST(raw_start,from_at)>=marker THEN 'covered' ELSE 'mixed' END)
$$;

CREATE FUNCTION private.admin_analytics_limit_segments(value JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_array_length(value)>32 THEN RAISE EXCEPTION 'admin_analytics_too_many_segments' USING ERRCODE='22023'; END IF;
 RETURN value;
END $$;
CREATE FUNCTION private.admin_analytics_series_data(f JSONB,stamp TIMESTAMPTZ,marker TIMESTAMPTZ) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH config AS(SELECT (f->>'from')::DATE::TIMESTAMP AT TIME ZONE 'UTC' AS lo,((f->>'to')::DATE+1)::TIMESTAMP AT TIME ZONE 'UTC' AS hi,
 COALESCE(f->>'granularity','day') AS grain),
 periods AS MATERIALIZED(SELECT tick AT TIME ZONE 'UTC' AS start_at,(tick+CASE WHEN grain='week' THEN INTERVAL '7 days' ELSE INTERVAL '1 day' END) AT TIME ZONE 'UTC' AS end_at,c.*
 FROM config c CROSS JOIN LATERAL generate_series(date_trunc(grain,c.lo AT TIME ZONE 'UTC'),date_trunc(grain,(c.hi-INTERVAL '1 microsecond') AT TIME ZONE 'UTC'),CASE WHEN grain='week' THEN INTERVAL '7 days' ELSE INTERVAL '1 day' END)tick),
 events AS MATERIALIZED(
 SELECT v.player_id,(v.attempt).started_at AS at,private.admin_analytics_segment(v.attempt) AS segment,'start'::TEXT AS kind,FALSE AS won,(v.attempt).mode AS mode
 FROM config c CROSS JOIN LATERAL private.admin_analytics_attempts(stamp,c.lo,c.hi)v WHERE TRUE
 AND private.admin_analytics_match(v.attempt,f) AND private.admin_analytics_age(v.signup_at,(v.attempt).started_at,f)
 UNION ALL
 SELECT a.player_id,a.verified_at,private.admin_analytics_segment(a),'finish',r.won,a.mode
 FROM config c JOIN public.run_attempts a ON a.verified_at>=c.lo AND a.verified_at<c.hi
 JOIN public.players p ON p.id=a.player_id JOIN auth.users u ON u.id=p.user_id
 JOIN public.runs r ON r.id=a.result_run_id AND r.run_attempt_id=a.id
 WHERE NOT COALESCE(u.is_anonymous,FALSE) AND p.created_at<=stamp AND a.created_at<=stamp AND a.started_at BETWEEN p.created_at AND stamp
 AND a.status='verified' AND a.result_run_id IS NOT NULL AND r.progression_source='verified' AND r.created_at<=stamp
 AND a.verified_at>=a.started_at AND a.verified_at<=stamp
 AND private.admin_analytics_match(a,f) AND private.admin_analytics_age(p.created_at,a.verified_at,f)),
 segments AS MATERIALIZED(SELECT value AS segment FROM jsonb_array_elements(private.admin_analytics_limit_segments(COALESCE((SELECT jsonb_agg(DISTINCT segment) FROM events),'[]')))),
 acquisitions AS(SELECT b.start_at,b.end_at,b.lo,b.hi,private.admin_analytics_count(COUNT(p.id)) AS accounts
 FROM periods b LEFT JOIN (public.players p JOIN auth.users u ON u.id=p.user_id AND NOT COALESCE(u.is_anonymous,FALSE))
 ON p.created_at>=GREATEST(b.start_at,b.lo) AND p.created_at<LEAST(b.end_at,b.hi) AND p.created_at<=stamp
 GROUP BY b.start_at,b.end_at,b.lo,b.hi),
 grid AS(SELECT s.segment,b.start_at,b.end_at,b.lo,b.hi,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE e.kind='start')) AS starts,
 private.admin_analytics_count(COUNT(DISTINCT e.player_id) FILTER(WHERE e.kind='start')) AS active,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE e.kind='finish')) AS finishes,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE e.kind='finish' AND e.won)) AS wins,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE e.kind='start' AND e.mode='daily')) AS daily_starts,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE e.kind='finish' AND e.mode='daily')) AS daily_finishes
 FROM segments s CROSS JOIN periods b LEFT JOIN events e ON e.segment=s.segment AND e.at>=GREATEST(b.start_at,b.lo) AND e.at<LEAST(b.end_at,b.hi)
 GROUP BY s.segment,b.start_at,b.end_at,b.lo,b.hi)
 SELECT jsonb_build_object('granularity',(SELECT grain FROM config),'segments',COALESCE((SELECT jsonb_agg(segment ORDER BY segment->>'id')FROM segments),'[]'),
 'acquisitions',COALESCE((SELECT jsonb_agg(private.admin_analytics_bounds(start_at,end_at,lo,hi,stamp,marker)||jsonb_build_object('accounts',accounts) ORDER BY start_at)FROM acquisitions),'[]'),
 'buckets',COALESCE((SELECT jsonb_agg(private.admin_analytics_bounds(start_at,end_at,lo,hi,stamp,marker)||jsonb_build_object('segmentId',segment->>'id','starts',starts,'activePlayers',active,'verifiedFinishes',finishes,'wins',wins,'dailyStarts',daily_starts,'dailyVerifiedFinishes',daily_finishes) ORDER BY segment->>'id',start_at)FROM grid),'[]'))
$$;

CREATE FUNCTION private.admin_analytics_retention_data(f JSONB,stamp TIMESTAMPTZ,first_complete DATE) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH enrolled AS MATERIALIZED(SELECT e.*,(e.signup_at AT TIME ZONE 'UTC')::DATE AS cohort_date FROM private.admin_analytics_enrollment(f,stamp)e),
 observed AS(SELECT e.player_id,e.cohort_date,e.segment,h.day,
 BOOL_OR(a.player_id IS NOT NULL) AS returned_any,BOOL_OR(a.player_id IS NOT NULL AND private.admin_analytics_segment(a)=e.segment) AS returned_same
 FROM enrolled e CROSS JOIN(VALUES(1),(7),(30))h(day) LEFT JOIN public.run_attempts a ON a.player_id=e.player_id
 AND a.started_at>=((e.cohort_date+h.day)::TIMESTAMP AT TIME ZONE 'UTC')
 AND a.started_at<((e.cohort_date+h.day+1)::TIMESTAMP AT TIME ZONE 'UTC')
 AND a.created_at<=stamp AND a.started_at BETWEEN e.signup_at AND stamp
 GROUP BY e.player_id,e.cohort_date,e.segment,h.day),
 cells AS(SELECT cohort_date,segment,day,private.admin_analytics_count(COUNT(*)) AS n,
 cohort_date>=first_complete AND ((cohort_date+1)::TIMESTAMP AT TIME ZONE 'UTC')<=stamp AS covered,
 ((cohort_date+day+1)::TIMESTAMP AT TIME ZONE 'UTC')<=stamp AS mature,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE returned_any)) AS any_n,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE returned_same)) AS same_n FROM observed GROUP BY cohort_date,segment,day),
 cohorts AS(SELECT cohort_date,segment,n,covered,jsonb_agg(jsonb_build_object('day',day,'mature',mature,'eligibleN',CASE WHEN covered AND mature THEN n ELSE 0 END,
 'returnedAny',any_n,'returnedSame',same_n)ORDER BY day) AS horizons FROM cells GROUP BY cohort_date,segment,n,covered)
 SELECT jsonb_build_object('segments',COALESCE((SELECT jsonb_agg(segment ORDER BY segment->>'id')FROM(SELECT DISTINCT segment FROM enrolled)s),'[]'),
 'cohorts',COALESCE((SELECT jsonb_agg(jsonb_build_object('cohortDate',to_char(cohort_date,'YYYY-MM-DD'),'segmentId',segment->>'id','cohortSize',n,'covered',covered,'horizons',horizons)ORDER BY cohort_date,segment->>'id')FROM cohorts),'[]'))
$$;

CREATE FUNCTION private.admin_analytics_funnel_data(f JSONB,stamp TIMESTAMPTZ,first_complete DATE) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH enrolled AS MATERIALIZED(SELECT e.*,(e.signup_at AT TIME ZONE 'UTC')::DATE AS cohort_date,
 (((e.signup_at AT TIME ZONE 'UTC')::DATE+8)::TIMESTAMP AT TIME ZONE 'UTC') AS horizon_end FROM private.admin_analytics_enrollment(f,stamp)e),
 combats AS(SELECT e.player_id,(array_agg(c.received_at ORDER BY c.sequence))[1] AS combat_at
 FROM enrolled e JOIN public.run_attempt_commands c ON c.attempt_id=(e.attempt).id
 WHERE c.kind='resolve_combat' AND c.received_at>=(e.attempt).started_at AND c.received_at<=stamp AND c.received_at<e.horizon_end
 GROUP BY e.player_id),
 stages AS MATERIALIZED(SELECT e.*,c.combat_at,
 CASE WHEN (e.attempt).status='verified' AND r.progression_source='verified' AND r.created_at<=stamp
 AND (e.attempt).verified_at>=c.combat_at AND (e.attempt).verified_at<=stamp AND (e.attempt).verified_at<e.horizon_end THEN (e.attempt).verified_at END AS finish_at,
 e.cohort_date>=first_complete AND ((e.cohort_date+1)::TIMESTAMP AT TIME ZONE 'UTC')<=stamp AS covered,
 e.horizon_end<=stamp AS mature
 FROM enrolled e LEFT JOIN combats c ON c.player_id=e.player_id LEFT JOIN public.runs r ON r.id=(e.attempt).result_run_id AND r.run_attempt_id=(e.attempt).id),
 returns AS(SELECT s.player_id,BOOL_OR(a.player_id IS NOT NULL)AS any_return,
 BOOL_OR(a.player_id IS NOT NULL AND private.admin_analytics_segment(a)=s.segment)AS same_return
 FROM stages s LEFT JOIN public.run_attempts a ON a.player_id=s.player_id AND a.id<>(s.attempt).id
 AND a.started_at>=((((s.finish_at AT TIME ZONE 'UTC')::DATE+1)::TIMESTAMP) AT TIME ZONE 'UTC') AND a.started_at<s.horizon_end
 AND a.created_at<=stamp AND a.started_at BETWEEN s.signup_at AND stamp
 GROUP BY s.player_id),
 population AS(SELECT s.*,r.any_return,r.same_return,(s.attempt).started_at<s.horizon_end AS has_start FROM stages s JOIN returns r ON r.player_id=s.player_id),
 grouped AS(SELECT segment,
 jsonb_build_object('signups',private.admin_analytics_count(COUNT(*)),
 'starts',private.admin_analytics_count(COUNT(*) FILTER(WHERE has_start)),
 'combatRequests',private.admin_analytics_count(COUNT(*) FILTER(WHERE has_start AND combat_at IS NOT NULL)),
 'verifiedFinishes',private.admin_analytics_count(COUNT(*) FILTER(WHERE has_start AND finish_at IS NOT NULL)),
 'returnedAny',private.admin_analytics_count(COUNT(*) FILTER(WHERE has_start AND finish_at IS NOT NULL AND any_return)),
 'returnedSame',private.admin_analytics_count(COUNT(*) FILTER(WHERE has_start AND finish_at IS NOT NULL AND same_return))) AS observed,
 jsonb_build_object('signups',private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND mature)),
 'starts',private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND mature AND has_start)),
 'combatRequests',private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND mature AND has_start AND combat_at IS NOT NULL)),
 'verifiedFinishes',private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND mature AND has_start AND finish_at IS NOT NULL)),
 'returnedAny',private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND mature AND has_start AND finish_at IS NOT NULL AND any_return)),
 'returnedSame',private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND mature AND has_start AND finish_at IS NOT NULL AND same_return))) AS eligible,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE covered AND NOT mature)) AS immature,
 private.admin_analytics_count(COUNT(*) FILTER(WHERE NOT covered)) AS unknown
 FROM population GROUP BY segment)
 SELECT jsonb_build_object('horizonDays',7,'segments',COALESCE((SELECT jsonb_agg(segment ORDER BY segment->>'id')FROM grouped),'[]'),
 'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('segmentId',segment->>'id','observed',observed,'eligible',eligible,'excludedImmatureN',immature,'excludedUnknownCoverageN',unknown) ORDER BY segment->>'id')FROM grouped),'[]'))
$$;
CREATE FUNCTION private.admin_analytics(p_resource TEXT,p_filters JSONB,p_snapshot TIMESTAMPTZ) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE stamp TIMESTAMPTZ:=COALESCE(p_snapshot,statement_timestamp()); marker TIMESTAMPTZ; first_complete DATE;
 f JSONB; data JSONB;lo TIMESTAMPTZ;hi TIMESTAMPTZ;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_current_user_admin() OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND NOT COALESCE(is_anonymous,FALSE)) THEN
 RAISE EXCEPTION 'admin_access_denied' USING ERRCODE='42501'; END IF;
 IF p_resource IS NULL OR p_resource NOT IN ('series','retention','funnel') OR NOT isfinite(stamp) OR stamp>statement_timestamp() THEN
 RAISE EXCEPTION 'admin_analytics_invalid_snapshot' USING ERRCODE='22023'; END IF;
 f:=private.admin_analytics_filters(p_filters,p_resource,stamp);
 SELECT started_at INTO STRICT marker FROM private.admin_analytics_coverage WHERE singleton;
 first_complete:=(marker AT TIME ZONE 'UTC')::DATE+CASE WHEN (marker AT TIME ZONE 'UTC')::TIME=TIME '00:00:00' THEN 0 ELSE 1 END;
 lo:=(f->>'from')::DATE::TIMESTAMP AT TIME ZONE 'UTC';hi:=((f->>'to')::DATE+1)::TIMESTAMP AT TIME ZONE 'UTC';
 data:=CASE p_resource WHEN 'series' THEN private.admin_analytics_series_data(f,stamp,marker)
 WHEN 'retention' THEN private.admin_analytics_retention_data(f,stamp,first_complete)
 ELSE private.admin_analytics_funnel_data(f,stamp,first_complete) END;
 IF jsonb_array_length(data->'segments')>32 THEN RAISE EXCEPTION 'admin_analytics_too_many_segments' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('snapshotAt',private.admin_analytics_timestamp(stamp),
 'window',jsonb_build_object('from',f->'from','to',f->'to','fromAt',private.admin_analytics_timestamp(lo),'toExclusiveAt',private.admin_analytics_timestamp(hi),'observedThroughAt',private.admin_analytics_timestamp(LEAST(hi,stamp))),
 'coverage',jsonb_build_object('startedAt',private.admin_analytics_timestamp(marker),'firstCompleteCohortDate',to_char(first_complete,'YYYY-MM-DD'),
 'population','surviving_registered_non_anonymous','activity','attempt_start','guests','not_collected','device','not_collected','accountAgeBasis',CASE WHEN p_resource='series' THEN 'event_utc_day' ELSE 'first_attempt_utc_day' END),
 'filters',f,'minimumSampleSize',30)||data;
END $$;
CREATE FUNCTION public.admin_analytics_series(p_filters JSONB,p_snapshot TIMESTAMPTZ DEFAULT NULL) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_analytics('series',p_filters,p_snapshot) $$;
CREATE FUNCTION public.admin_analytics_retention(p_filters JSONB,p_snapshot TIMESTAMPTZ DEFAULT NULL) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_analytics('retention',p_filters,p_snapshot) $$;
CREATE FUNCTION public.admin_analytics_funnel(p_filters JSONB,p_snapshot TIMESTAMPTZ DEFAULT NULL) RETURNS JSONB
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_analytics('funnel',p_filters,p_snapshot) $$;

REVOKE ALL ON FUNCTION private.preserve_admin_analytics_coverage(),private.admin_analytics_timestamp(TIMESTAMPTZ),private.admin_analytics_count(BIGINT),
 private.admin_analytics_limit_segments(JSONB),private.admin_analytics_filters(JSONB,TEXT,TIMESTAMPTZ),private.admin_analytics_segment(public.run_attempts),private.admin_analytics_match(public.run_attempts,JSONB),
 private.admin_analytics_age(TIMESTAMPTZ,TIMESTAMPTZ,JSONB),private.admin_analytics_attempts(TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ),private.admin_analytics_enrollment(JSONB,TIMESTAMPTZ),
 private.admin_analytics_bounds(TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ,TIMESTAMPTZ),
 private.admin_analytics_series_data(JSONB,TIMESTAMPTZ,TIMESTAMPTZ),private.admin_analytics_retention_data(JSONB,TIMESTAMPTZ,DATE),
 private.admin_analytics_funnel_data(JSONB,TIMESTAMPTZ,DATE),private.admin_analytics(TEXT,JSONB,TIMESTAMPTZ)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.admin_analytics(TEXT,JSONB,TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_analytics_series(JSONB,TIMESTAMPTZ),public.admin_analytics_retention(JSONB,TIMESTAMPTZ),public.admin_analytics_funnel(JSONB,TIMESTAMPTZ)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_series(JSONB,TIMESTAMPTZ),public.admin_analytics_retention(JSONB,TIMESTAMPTZ),public.admin_analytics_funnel(JSONB,TIMESTAMPTZ) TO authenticated;
COMMIT;
