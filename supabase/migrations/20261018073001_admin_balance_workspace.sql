-- ADM-S4: descriptive, read-only verified balance populations. No new gameplay
-- events, authority writes, feature flags or Candies ledger are introduced.
BEGIN;

CREATE FUNCTION private.admin_balance_filters(p_filters JSONB, stamp TIMESTAMPTZ)
  RETURNS JSONB
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
DECLARE
  f JSONB;
BEGIN
  IF p_filters IS NULL
    OR jsonb_typeof(p_filters) <> 'object'
    OR p_filters ? 'accountAge'
    OR p_filters ? 'granularity' THEN
    RAISE EXCEPTION 'admin_balance_invalid_filters'
      USING ERRCODE = '22023';
  END IF;
  IF p_filters ? 'championId' AND (
    jsonb_typeof(p_filters -> 'championId') <> 'string'
    OR p_filters ->> 'championId' !~ '^[A-Za-z0-9_.:-]{1,100}$'
  ) THEN
    RAISE EXCEPTION 'admin_balance_invalid_champion'
      USING ERRCODE = '22023';
  END IF;
  f := private.admin_analytics_filters(p_filters - 'championId', 'balance', stamp);
  RETURN (f - 'accountAge') || CASE WHEN p_filters ? 'championId' THEN
    jsonb_build_object(
      'championId', p_filters -> 'championId'
    )
  ELSE
    '{}'::JSONB
  END;
END
$$;

CREATE FUNCTION private.admin_balance_context(a public.run_attempts)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH identity AS(
    SELECT
      jsonb_build_object(
        'segmentId', private.admin_analytics_segment(a) ->> 'id',
        'initialComposition', to_jsonb(ARRAY( SELECT DISTINCT
            v
          FROM unnest(a.initial_team) v ORDER BY v)),
        'runeIds', to_jsonb(ARRAY( SELECT DISTINCT
            v
          FROM unnest(a.rune_ids) v ORDER BY v)),
        'masteryHash', encode(extensions.digest(convert_to(a.mastery_snapshot::TEXT, 'UTF8'), 'sha256'), 'hex'),
        'enhancementHash', encode(extensions.digest(convert_to(a.enhancement_snapshot::TEXT, 'UTF8'), 'sha256'), 'hex')
    ) AS value
  )
  SELECT
    value || jsonb_build_object(
      'id', md5(value::TEXT)
  )
  FROM
    identity
$$;

CREATE FUNCTION private.admin_balance_population(f JSONB, stamp TIMESTAMPTZ)
  RETURNS TABLE(
    attempt public.run_attempts,
    run public.runs,
    segment JSONB,
    context JSONB)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    a,
    r,
    private.admin_analytics_segment(a),
    private.admin_balance_context(a)
  FROM
    public.run_attempts a
    JOIN public.runs r ON r.id = a.result_run_id
    AND r.run_attempt_id = a.id
    AND r.player_id = a.player_id
    JOIN public.players p ON p.id = a.player_id
    AND p.user_id = a.user_id
    JOIN auth.users u ON u.id = a.user_id
  WHERE
    a.status = 'verified'
    AND r.progression_source = 'verified'
    AND a.result_hash IS NOT NULL
    AND r.progression_payload_hash = a.result_hash
    AND NOT COALESCE(u.is_anonymous, FALSE)
    AND a.verified_at >=((f ->> 'from')::DATE::TIMESTAMP AT TIME ZONE 'UTC')
    AND a.verified_at <(((f ->> 'to')::DATE + 1)::TIMESTAMP AT TIME ZONE 'UTC')
    AND a.verified_at <= stamp
    AND a.created_at <= stamp
    AND r.created_at <= stamp
    AND p.created_at <= stamp
    AND a.started_at <= a.verified_at
    AND a.started_at >= p.created_at
    AND NOT EXISTS(
    SELECT
      1
    FROM
      unnest(a.initial_team || a.rune_ids) v
    WHERE
      v !~ '^[A-Za-z0-9_.:-]{1,100}$')
    AND private.admin_analytics_match(a, f)
$$;

CREATE FUNCTION private.admin_balance_ledger(r public.runs, m public.run_team_members)
  RETURNS BOOLEAN
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    COALESCE(jsonb_typeof(r.run_ledger -> 'champions' -> m.champion_id) = 'object'
      AND r.run_ledger -> 'champions' -> m.champion_id ->> 'damage_dealt' = m.damage_dealt::TEXT
      AND r.run_ledger -> 'champions' -> m.champion_id ->> 'healing_done' = m.healing_done::TEXT, FALSE)
$$;

-- Initial selections are measured on starts, including attempts which have not
-- produced a verified finish. Keep this denominator independent of final teams.
CREATE FUNCTION private.admin_balance_selection_data(f JSONB, stamp TIMESTAMPTZ)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH base AS MATERIALIZED(
    SELECT
      v.player_id,
      v.attempt,
      private.admin_analytics_segment(
        v.attempt
    ) AS segment
    FROM
      private.admin_analytics_attempts(
        stamp,(
          f ->> 'from'
      )::DATE::TIMESTAMP AT TIME ZONE 'UTC',((
            f ->> 'to'
        )::DATE + 1
      )::TIMESTAMP AT TIME ZONE 'UTC'
    ) v
    WHERE
      private.admin_analytics_match(
        v.attempt, f
    )
      AND NOT EXISTS(
      SELECT
        1
      FROM
        unnest((
            v.attempt
        ).initial_team
      ) v
      WHERE
        v !~ '^[A-Za-z0-9_.:-]{1,100}$'
    )
  ),
  cohorts AS(
    SELECT
      segment,
      COUNT(*)::BIGINT AS starts,
      COUNT(DISTINCT player_id)::BIGINT AS players
    FROM
      base
    GROUP BY
      segment
  ),
  candidates AS(
    SELECT
      c.segment,
      c.starts,
      c.players,
      g.content_id AS champion_id,
      'known'::TEXT AS catalog_status
    FROM
      cohorts c
      JOIN public.gameplay_content_catalog g ON g.gameplay_ruleset_version =(c.segment ->> 'gameplayVersion')::SMALLINT
      AND g.content_type = 'champion'
    UNION ALL
    SELECT
      c.segment,
      c.starts,
      c.players,
      v.champion_id,
      'unknown'::TEXT
    FROM
      cohorts c
      JOIN base b ON b.segment = c.segment
      CROSS JOIN LATERAL( SELECT DISTINCT
        champion_id
      FROM
        unnest((b.attempt).initial_team) champion_id) v
    WHERE
      NOT EXISTS(
      SELECT
        1
      FROM
        public.gameplay_content_catalog g
      WHERE
        g.gameplay_ruleset_version =(c.segment ->> 'gameplayVersion')::SMALLINT
        AND g.content_type = 'champion'
        AND g.content_id = v.champion_id)
    GROUP BY
      c.segment,
      c.starts,
      c.players,
      v.champion_id
  ),
  picks AS(
    SELECT
      b.segment,
      v.champion_id,
      COUNT(*)::BIGINT AS starts,
      COUNT(DISTINCT b.player_id)::BIGINT AS players
    FROM
      base b
      CROSS JOIN LATERAL( SELECT DISTINCT
        champion_id
      FROM
        unnest((b.attempt).initial_team) champion_id) v
    GROUP BY
      b.segment,
      v.champion_id
  ),
  rows AS(
    SELECT
      jsonb_build_object(
        'segmentId', c.segment ->> 'id',
        'championId', c.champion_id,
        'catalogStatus', c.catalog_status,
        'cohortStarts', private.admin_analytics_count(c.starts),
        'cohortPlayers', private.admin_analytics_count(c.players),
        'starts', private.admin_analytics_count(COALESCE(p.starts, 0)),
        'players', private.admin_analytics_count(COALESCE(p.players, 0))
    ) AS value
    FROM
      candidates c
      LEFT JOIN picks p ON p.segment = c.segment
      AND p.champion_id = c.champion_id
    WHERE
      NOT f ? 'championId'
      OR c.champion_id = f ->> 'championId'
  )
  SELECT
    jsonb_build_object(
      'population', jsonb_build_object(
        'starts', private.admin_analytics_count((
          SELECT
            COUNT(*)
          FROM base)),
        'uniquePlayers', private.admin_analytics_count((
          SELECT
            COUNT(DISTINCT player_id)
          FROM base))
    ),
      'segments', COALESCE((
        SELECT
          jsonb_agg(segment ORDER BY segment ->> 'id')
        FROM cohorts), '[]'),
      'rows', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'segmentId', value ->> 'championId')
        FROM rows), '[]')
  )
$$;

CREATE FUNCTION private.admin_balance_champion_data(f JSONB, stamp TIMESTAMPTZ)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH base AS MATERIALIZED(
    SELECT
      *
    FROM
      private.admin_balance_population(
        f, stamp
    )
  ),
  cohorts AS(
    SELECT
      context,
      segment,
      COUNT(*)::BIGINT AS runs,
      COUNT(DISTINCT(run).player_id)::BIGINT AS players
    FROM
      base
    GROUP BY
      context,
      segment
  ),
  candidates AS(
    SELECT
      c.context,
      c.segment,
      c.runs,
      c.players,
      g.content_id AS champion_id,
      'known'::TEXT AS catalog_status
    FROM
      cohorts c
      JOIN public.gameplay_content_catalog g ON g.gameplay_ruleset_version =(c.segment ->> 'gameplayVersion')::SMALLINT
      AND g.content_type = 'champion'
    UNION ALL
    SELECT
      c.context,
      c.segment,
      c.runs,
      c.players,
      m.champion_id,
      'unknown'::TEXT
    FROM
      cohorts c
      JOIN base b ON b.context = c.context
      JOIN public.run_team_members m ON m.run_id =(b.run).id
    WHERE
      m.champion_id ~ '^[A-Za-z0-9_.:-]{1,100}$'
      AND NOT EXISTS(
      SELECT
        1
      FROM
        public.gameplay_content_catalog g
      WHERE
        g.gameplay_ruleset_version =(c.segment ->> 'gameplayVersion')::SMALLINT
        AND g.content_type = 'champion'
        AND g.content_id = m.champion_id)
    GROUP BY
      c.context,
      c.segment,
      c.runs,
      c.players,
      m.champion_id
  ),
  members AS(
    SELECT
      b.context,
      m.champion_id,
      COUNT(*)::BIGINT AS runs,
      COUNT(DISTINCT(b.run).player_id)::BIGINT AS players,
      COUNT(*) FILTER(WHERE(b.run).won)::BIGINT AS wins,
      COUNT(*) FILTER(WHERE m.survived)::BIGINT AS survived,
      COUNT(*) FILTER(WHERE(b.attempt).gameplay_ruleset_version >= 7
        AND private.admin_balance_ledger(b.run, m))::BIGINT AS ledger_runs,
      AVG(m.damage_dealt) FILTER(WHERE(b.attempt).gameplay_ruleset_version >= 7
        AND private.admin_balance_ledger(b.run, m)) AS damage,
      AVG(m.healing_done) FILTER(WHERE(b.attempt).gameplay_ruleset_version >= 7
        AND private.admin_balance_ledger(b.run, m)) AS healing
    FROM
      base b
      JOIN public.run_team_members m ON m.run_id =(b.run).id
    WHERE
      m.champion_id ~ '^[A-Za-z0-9_.:-]{1,100}$'
    GROUP BY
      b.context,
      m.champion_id
  ),
  rows AS(
    SELECT
      jsonb_build_object(
        'contextId', c.context ->> 'id',
        'championId', c.champion_id,
        'catalogStatus', c.catalog_status,
        'cohortRuns', private.admin_analytics_count(c.runs),
        'cohortPlayers', private.admin_analytics_count(c.players),
        'runs', private.admin_analytics_count(COALESCE(m.runs, 0)),
        'players', private.admin_analytics_count(COALESCE(m.players, 0)),
        'wins', private.admin_analytics_count(COALESCE(m.wins, 0)),
        'survived', private.admin_analytics_count(COALESCE(m.survived, 0)),
        'ledgerRuns', private.admin_analytics_count(COALESCE(m.ledger_runs, 0)),
        'meanDamageDealt', m.damage,
        'meanHealingDone', m.healing
    ) AS value
    FROM
      candidates c
      LEFT JOIN members m ON m.context = c.context
      AND m.champion_id = c.champion_id
    WHERE
      NOT f ? 'championId'
      OR c.champion_id = f ->> 'championId'
  )
  SELECT
    jsonb_build_object(
      'segments', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'id')
        FROM( SELECT DISTINCT
            segment AS value
          FROM base) s), '[]'),
      'contexts', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'id')
        FROM( SELECT DISTINCT
            context AS value
          FROM base) s), '[]'),
      'population', jsonb_build_object(
        'verifiedRuns', private.admin_analytics_count((
          SELECT
            COUNT(*)
          FROM base)),
        'uniquePlayers', private.admin_analytics_count((
          SELECT
            COUNT(DISTINCT(run).player_id)
          FROM base))
    ),
      'selections', private.admin_balance_selection_data(f, stamp),
      'metrics', jsonb_build_object(
        'damage', 'ledger_total',
        'healing', 'ledger_total',
        'dps', 'not_collected',
        'crowdControl', 'not_collected'
    ),
      'rows', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'contextId', value ->> 'championId')
        FROM rows), '[]')
  )
$$;

CREATE FUNCTION private.admin_balance_build_data(f JSONB, stamp TIMESTAMPTZ)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  WITH base AS MATERIALIZED(
    SELECT
      *
    FROM
      private.admin_balance_population(
        f, stamp
    )
  ),
  cohorts AS(
    SELECT
      context,
      COUNT(*)::BIGINT AS runs,
      COUNT(DISTINCT(run).player_id)::BIGINT AS players
    FROM
      base
    GROUP BY
      context
  ),
  member_items AS(
    SELECT
      b.*,
      m.champion_id,
      m.items_collected,
      ARRAY( SELECT DISTINCT
        v
      FROM
        unnest(m.items_collected) v
      WHERE
        v ~ '^[A-Za-z0-9_.:-]{1,100}$'
      ORDER BY
        v) AS ids,
      CASE WHEN(b.attempt).gameplay_ruleset_version >= 7
      AND private.admin_balance_ledger(b.run, m)
      AND jsonb_typeof((b.run).run_ledger -> 'items') = 'array'
      AND NOT EXISTS(
      SELECT
        1
      FROM
        unnest(m.items_collected) v
      WHERE
        v !~ '^[A-Za-z0-9_.:-]{1,100}$')
      AND ARRAY( SELECT DISTINCT
        v
      FROM
        unnest(m.items_collected) v
      ORDER BY
        v) = ARRAY( SELECT DISTINCT
        e ->> 'item_id'
      FROM
        jsonb_array_elements(
          CASE WHEN jsonb_typeof((b.run).run_ledger -> 'items') = 'array' THEN
          (b.run).run_ledger -> 'items'
          ELSE
          '[]'::JSONB
          END) e
      WHERE
        e ->> 'action' = 'equipped'
        AND e ->> 'champion_id' = m.champion_id
      ORDER BY
        e ->> 'item_id') THEN
      CASE WHEN cardinality(m.items_collected) = 0 THEN
      'empty'
      ELSE
      'observed'
      END
      ELSE
      'partial'
      END AS state
    FROM
      base b
      JOIN public.run_team_members m ON m.run_id =(b.run).id
    WHERE
      m.champion_id ~ '^[A-Za-z0-9_.:-]{1,100}$'
      AND(NOT f ? 'championId'
        OR m.champion_id = f ->> 'championId')
  ),
  observations AS(
    SELECT
      context,
      (run).id AS run_id,
      (run).player_id AS player_id,
      (run).won,
      'items'::TEXT AS kind,
      champion_id,
      ids,
      state,
      '{}'::TEXT[] AS unknown_ids
    FROM
      member_items
    UNION ALL
    SELECT
      b.context,
      (b.run).id,
      (b.run).player_id,
      (b.run).won,
      kind,
      NULL::TEXT,
      ids,
      CASE WHEN cardinality(raw_ids) <> cardinality(ids) THEN
      'partial'
      WHEN cardinality(ids) = 0 THEN
      'empty'
      ELSE
      'observed'
      END,
      ARRAY( SELECT DISTINCT
        v
      FROM
        unnest(ids) v
      WHERE
        NOT EXISTS(
        SELECT
          1
        FROM
          public.gameplay_content_catalog g
        WHERE
          g.gameplay_ruleset_version =(b.attempt).gameplay_ruleset_version
          AND g.content_type = CASE WHEN kind = 'runes' THEN
          'rune'
          ELSE
          'augment'
          END
          AND g.content_id = v)
      ORDER BY
        v)
    FROM
      base b
      CROSS JOIN LATERAL(
        VALUES('runes',(b.run).rune_ids),
        ('augments',(b.run).augment_ids)) v(kind, raw_ids)
      CROSS JOIN LATERAL(
      SELECT
        CASE WHEN kind = 'augments' THEN
        ARRAY(
        SELECT
          v
        FROM
          unnest(raw_ids) v
        WHERE
          v ~ '^[A-Za-z0-9_.:-]{1,100}$'
        ORDER BY
          v)
        ELSE
        ARRAY( SELECT DISTINCT
          v
        FROM
          unnest(raw_ids) v
        WHERE
          v ~ '^[A-Za-z0-9_.:-]{1,100}$'
        ORDER BY
          v)
        END AS ids) s
  ),
  grouped AS(
    SELECT
      context,
      kind,
      champion_id,
      ids,
      state,
      unknown_ids,
      COUNT(DISTINCT run_id)::BIGINT AS runs,
      COUNT(DISTINCT player_id)::BIGINT AS players,
      COUNT(DISTINCT run_id) FILTER(WHERE won)::BIGINT AS wins
    FROM
      observations
    GROUP BY
      context,
      kind,
      champion_id,
      ids,
      state,
      unknown_ids
  ),
  rows AS(
    SELECT
      jsonb_build_object(
        'contextId', g.context ->> 'id',
        'kind', g.kind,
        'championId', g.champion_id,
        'ids', g.ids,
        'unknownIds', g.unknown_ids,
        'state', g.state,
        'cohortRuns', private.admin_analytics_count(c.runs),
        'cohortPlayers', private.admin_analytics_count(c.players),
        'runs', private.admin_analytics_count(g.runs),
        'players', private.admin_analytics_count(g.players),
        'wins', private.admin_analytics_count(g.wins)
    ) AS value
    FROM
      grouped g
      JOIN cohorts c ON c.context = g.context
  )
  SELECT
    jsonb_build_object(
      'segments', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'id')
        FROM( SELECT DISTINCT
            segment AS value
          FROM base) s), '[]'),
      'contexts', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'id')
        FROM( SELECT DISTINCT
            context AS value
          FROM base) s), '[]'),
      'population', jsonb_build_object(
        'verifiedRuns', private.admin_analytics_count((
          SELECT
            COUNT(*)
          FROM base)),
        'uniquePlayers', private.admin_analytics_count((
          SELECT
            COUNT(DISTINCT(run).player_id)
          FROM base))
    ),
      'itemBasis', 'ever_equipped_set',
      'exposure', 'not_collected',
      'itemCatalog', 'not_available',
      'rows', COALESCE((
        SELECT
          jsonb_agg(value ORDER BY value ->> 'contextId', value ->> 'kind', value ->> 'championId', value -> 'ids', value ->> 'state')
        FROM rows), '[]')
  )
$$;

CREATE FUNCTION private.admin_balance_config_data(stamp TIMESTAMPTZ)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    jsonb_build_object(
      'snapshotAt', private.admin_analytics_timestamp(stamp),
      'readOnly', TRUE,
      'minimumSampleSize', 30,
      'gameplayRulesets', COALESCE((
        SELECT
          jsonb_agg(jsonb_build_object(
              'version', version,
              'code', code,
              'engineVersion', engine_version,
              'commandVersion', command_schema_version,
              'contentHash', content_hash,
              'active', is_active
          )
          ORDER BY version)
        FROM public.gameplay_rulesets), '[]'),
      'progressionRulesets', COALESCE((
        SELECT
          jsonb_agg(jsonb_build_object(
              'version', version,
              'code', code,
              'active', is_active
          )
          ORDER BY version)
        FROM public.progression_rulesets), '[]'),
      'championEconomy', (
      SELECT
        jsonb_build_object(
          'enabled', enabled,
          'economyVersion', economy_version,
          'catalogVersion', catalog_version,
          'gameplayVersion', gameplay_ruleset_version,
          'activatedAt', private.admin_analytics_timestamp(activated_at),
          'updatedAt', private.admin_analytics_timestamp(updated_at)
      )
      FROM public.champion_economy_config
      WHERE
        singleton),
      'trees', jsonb_build_object(
        'status', 'dependency_unavailable',
        'dependency', 'TREE-10'
    ),
      'unsupportedMetrics', jsonb_build_array('dps', 'crowd_control_duration', 'item_exposure')
  )
$$;

CREATE FUNCTION private.admin_balance(p_resource TEXT, p_filters JSONB, p_snapshot TIMESTAMPTZ)
  RETURNS JSONB
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  stamp TIMESTAMPTZ := COALESCE(p_snapshot, statement_timestamp());
  f JSONB;
  data JSONB;
BEGIN
  IF auth.uid() IS NULL
    OR NOT public.is_current_user_admin()
    OR NOT EXISTS (
    SELECT
      1
    FROM
      auth.users
    WHERE
      id = auth.uid()
      AND NOT COALESCE(is_anonymous, FALSE)
  ) THEN
    RAISE EXCEPTION 'admin_access_denied'
      USING ERRCODE = '42501';
  END IF;
  IF p_resource IS NULL
    OR p_resource NOT IN ('champions', 'builds', 'config')
    OR NOT isfinite(stamp)
    OR stamp > statement_timestamp() THEN
    RAISE EXCEPTION 'admin_balance_invalid_snapshot'
      USING ERRCODE = '22023';
  END IF;
  IF p_resource = 'config' THEN
    data := private.admin_balance_config_data(stamp);
    IF jsonb_array_length(data -> 'gameplayRulesets') > 128
      OR jsonb_array_length(data -> 'progressionRulesets') > 128 THEN
      RAISE EXCEPTION 'admin_balance_too_many_rulesets'
        USING ERRCODE = '22023';
    END IF;
    RETURN data;
  END IF;
  f := private.admin_balance_filters(p_filters, stamp);
  data := CASE WHEN p_resource = 'champions' THEN
    private.admin_balance_champion_data(f, stamp)
  ELSE
    private.admin_balance_build_data(f, stamp)
  END;
  IF jsonb_array_length(data -> 'segments') > 32
    OR jsonb_array_length(data -> 'contexts') > 128
    OR jsonb_array_length(data -> 'rows') > 1024 THEN
    RAISE EXCEPTION 'admin_balance_scope_too_large'
      USING ERRCODE = '22023';
  END IF;
  IF p_resource = 'champions' AND (
    jsonb_array_length(data -> 'selections' -> 'segments') > 32
    OR jsonb_array_length(data -> 'selections' -> 'rows') > 1024
  ) THEN
    RAISE EXCEPTION 'admin_balance_scope_too_large'
      USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'snapshotAt', private.admin_analytics_timestamp(stamp),
    'filters', f,
    'minimumSampleSize', 30
  ) || data;
END
$$;

CREATE FUNCTION public.admin_balance_champions(p_filters JSONB, p_snapshot TIMESTAMPTZ DEFAULT NULL)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_balance('champions', p_filters, p_snapshot)
$$;

CREATE FUNCTION public.admin_balance_builds(p_filters JSONB, p_snapshot TIMESTAMPTZ DEFAULT NULL)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_balance('builds', p_filters, p_snapshot)
$$;

CREATE FUNCTION public.admin_balance_config()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = ''
  AS $$
  SELECT
    private.admin_balance('config', NULL, NULL)
$$;

REVOKE ALL ON FUNCTION private.admin_balance_filters(JSONB, TIMESTAMPTZ), private.admin_balance_context(public.run_attempts), private.admin_balance_population(JSONB, TIMESTAMPTZ), private.admin_balance_ledger(public.runs, public.run_team_members), private.admin_balance_selection_data(JSONB, TIMESTAMPTZ), private.admin_balance_champion_data(JSONB, TIMESTAMPTZ), private.admin_balance_build_data(JSONB, TIMESTAMPTZ), private.admin_balance_config_data(TIMESTAMPTZ), private.admin_balance(TEXT, JSONB, TIMESTAMPTZ), public.admin_balance_champions(JSONB, TIMESTAMPTZ), public.admin_balance_builds(JSONB, TIMESTAMPTZ), public.admin_balance_config() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION private.admin_balance(TEXT, JSONB, TIMESTAMPTZ), public.admin_balance_champions(JSONB, TIMESTAMPTZ), public.admin_balance_builds(JSONB, TIMESTAMPTZ), public.admin_balance_config() TO authenticated;

COMMENT ON FUNCTION public.admin_balance_champions(JSONB, TIMESTAMPTZ) IS 'Read-only administrator aggregates of retained canonical verified final teams; exact authority/composition/loadout cohorts, not login or all-start pick rates; no identifiers or payloads.';

COMMENT ON FUNCTION public.admin_balance_builds(JSONB, TIMESTAMPTZ) IS 'Read-only descriptive verified equipped-history sets and rune/augment selections; item opportunity, concurrent equipment and causal effectiveness are not measured.';

COMMENT ON FUNCTION public.admin_balance_config() IS 'Live database rules and economy flag state after a current administrator check; read only; TREE-10 unavailable; no rule mutation.';

COMMIT;
