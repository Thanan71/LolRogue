-- TREE-10 extends ADM-20. Commands/receipts, the existing Candy ledger and frozen
-- verified attempts are the only sources; no tracking event or second ledger.
BEGIN;
CREATE INDEX progression_commands_tree_window ON public.progression_commands(completed_at,ruleset_version,command_type)
  WHERE completed_at IS NOT NULL;

CREATE FUNCTION private.admin_tree_interval(wins BIGINT,runs BIGINT,players BIGINT,complete BOOLEAN)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN NOT complete OR players<30 OR runs<30 OR players<>runs THEN 'null'::jsonb ELSE
    jsonb_build_object('lower',GREATEST(0,center-margin),'upper',LEAST(1,center+margin)) END
  FROM (SELECT (wins::double precision/NULLIF(runs,0)+3.841458820694124/(2*NULLIF(runs,0)))/(1+3.841458820694124/NULLIF(runs,0)) center,
    1.959963984540054*sqrt((wins::double precision/NULLIF(runs,0))*(1-wins::double precision/NULLIF(runs,0))/NULLIF(runs,0)
      +3.841458820694124/(4*NULLIF(runs::double precision*runs,0)))/(1+3.841458820694124/NULLIF(runs,0)) margin) x
$$;
REVOKE ALL ON FUNCTION private.admin_tree_interval(BIGINT,BIGINT,BIGINT,BOOLEAN) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.admin_balance_tree_data(f JSONB,stamp TIMESTAMPTZ)
RETURNS JSONB LANGUAGE sql STABLE SET search_path='' AS $$
WITH base AS MATERIALIZED(SELECT * FROM private.admin_balance_population(f,stamp) b
  WHERE (b.run).progression_version=(b.attempt).ruleset_version),
events AS MATERIALIZED(
  SELECT c.*,p.id AS player_id,t.amount AS ledger_amount,
    CASE WHEN c.response->>'candy_cost' ~ '^[1-9][0-9]{0,9}$' THEN (c.response->>'candy_cost')::bigint END AS cost,
    n.node_id,n.champion_role
  FROM public.progression_commands c JOIN public.players p ON p.user_id=c.user_id
  JOIN auth.users u ON u.id=c.user_id AND NOT COALESCE(u.is_anonymous,FALSE)
  LEFT JOIN public.enhancement_node_catalog n ON n.ruleset_version=c.ruleset_version
    AND n.node_id=c.response->>'node_id'
  LEFT JOIN public.candy_transactions t ON t.player_id=p.id AND
    t.source_key=(CASE WHEN c.command_type='enhancement_unlock' THEN 'purchase:' ELSE 'refund:' END)||c.command_id::text
    AND t.created_at<=stamp
  WHERE c.completed_at IS NOT NULL AND c.completed_at<=stamp AND c.created_at<=stamp AND p.created_at<=stamp
    AND c.completed_at>=(f->>'from')::date::timestamp AT TIME ZONE 'UTC'
    AND c.completed_at<((f->>'to')::date+1)::timestamp AT TIME ZONE 'UTC'
    AND (NOT f ? 'progressionVersion' OR c.ruleset_version=(f->>'progressionVersion')::smallint)
    AND (NOT f ? 'championId' OR c.response->>'champion_id'=f->>'championId')
), totals AS(
  SELECT count(*) FILTER(WHERE command_type='enhancement_unlock') AS commands,
    count(*) FILTER(WHERE command_type='enhancement_reset') AS resets,
    count(DISTINCT user_id) FILTER(WHERE command_type='enhancement_unlock') AS purchasers,
    COALESCE(-sum(ledger_amount) FILTER(WHERE command_type='enhancement_unlock'),0) AS spent,
    COALESCE(sum(ledger_amount) FILTER(WHERE command_type='enhancement_reset'),0) AS refunded,
    CASE WHEN count(*) FILTER(WHERE command_type='enhancement_unlock' AND cost IS NULL)>0 THEN NULL
      ELSE COALESCE(sum(cost) FILTER(WHERE command_type='enhancement_unlock'),0) END AS attested_spend,
    COALESCE(bool_and(COALESCE(ledger_amount IS NOT NULL AND
      ((command_type='enhancement_unlock' AND ledger_amount=-cost) OR
       (command_type='enhancement_reset' AND ledger_amount=(response->>'refund_amount')::bigint)),FALSE)),TRUE) AS complete,
    count(*) FILTER(WHERE command_type='enhancement_unlock' AND (node_id IS NULL OR cost IS NULL)) AS unclassified
  FROM events
), node_counts AS(
  SELECT ruleset_version,node_id,champion_role,response->>'champion_id' AS champion,
    count(*) AS purchases,count(DISTINCT user_id) AS players FROM events
  WHERE command_type='enhancement_unlock' AND node_id IS NOT NULL AND cost IS NOT NULL
  GROUP BY ruleset_version,node_id,champion_role,response->>'champion_id'
), branch_counts AS(
  SELECT ruleset_version,regexp_replace(node_id,'_[0-9]+$','') AS branch_id,champion_role,response->>'champion_id' AS champion,
    count(*) AS purchases,count(DISTINCT user_id) AS players FROM events
  WHERE command_type='enhancement_unlock' AND node_id IS NOT NULL AND cost IS NOT NULL
  GROUP BY ruleset_version,regexp_replace(node_id,'_[0-9]+$',''),champion_role,response->>'champion_id'
), observations AS MATERIALIZED(
  SELECT b.*,m.champion_id,
    CASE WHEN jsonb_typeof((attempt).enhancement_snapshot->m.champion_id)='object'
      THEN (attempt).enhancement_snapshot->m.champion_id ELSE '{}'::jsonb END AS raw,
    (jsonb_typeof((attempt).enhancement_snapshot->m.champion_id)='object' OR (attempt).mode='daily') AS present
  FROM base b JOIN public.run_team_members m ON m.run_id=(b.run).id
  WHERE (NOT f ? 'championId' OR m.champion_id=f->>'championId')
), snapshots AS MATERIALIZED(
  SELECT o.*,COALESCE((SELECT jsonb_object_agg(v.key,v.value) FROM jsonb_each(raw) v
    JOIN public.enhancement_node_catalog n ON n.ruleset_version=(o.attempt).ruleset_version AND n.node_id=v.key
    WHERE jsonb_typeof(v.value)='number' AND v.value::text ~ '^[1-9][0-9]{0,8}$'
      AND (CASE WHEN v.value::text ~ '^[1-9][0-9]{0,8}$' THEN v.value::text::bigint ELSE 0 END)<=n.max_rank),'{}'::jsonb) AS ranks,
    COALESCE(present,FALSE) AND NOT EXISTS(SELECT 1 FROM jsonb_each(raw) v LEFT JOIN public.enhancement_node_catalog n
      ON n.ruleset_version=(o.attempt).ruleset_version AND n.node_id=v.key
      WHERE n.node_id IS NULL OR jsonb_typeof(v.value)<>'number' OR NOT v.value::text ~ '^[0-9]{1,9}$'
        OR (CASE WHEN v.value::text ~ '^[0-9]{1,9}$' THEN v.value::text::bigint ELSE 0 END)>n.max_rank) AS complete
  FROM observations o
), builds AS MATERIALIZED(
  SELECT context->>'id' AS context_id,segment->>'id' AS segment_id,champion_id,ranks,
    encode(extensions.digest(convert_to(ranks::text,'UTF8'),'sha256'),'hex') AS snapshot_hash,
    CASE WHEN NOT complete THEN 'partial' WHEN ranks='{}'::jsonb THEN 'empty' ELSE 'observed' END AS state,
    count(*) AS runs,count(DISTINCT (run).player_id) AS players,count(*) FILTER(WHERE (run).won) AS wins
  FROM snapshots GROUP BY context->>'id',segment->>'id',champion_id,ranks,complete
), limited_builds AS(SELECT * FROM builds ORDER BY runs DESC,context_id,champion_id,snapshot_hash,state LIMIT 200)
SELECT jsonb_build_object(
  'segments',COALESCE((SELECT jsonb_agg(segment ORDER BY segment->>'id') FROM (SELECT DISTINCT segment FROM base) s),'[]'::jsonb),
  'contexts',COALESCE((SELECT jsonb_agg(context ORDER BY context->>'id') FROM (SELECT DISTINCT context FROM base) c),'[]'::jsonb),
  'population',jsonb_build_object('verifiedRuns',(SELECT count(*) FROM base),'uniquePlayers',(SELECT count(DISTINCT (run).player_id) FROM base)),
  'buildBasis','frozen_attempt_snapshot','causalEffect','not_measured','catalogueBasis','current_active_contract',
  'catalogue',COALESCE((SELECT jsonb_agg(jsonb_build_object('catalogVersion',n.ruleset_version,'nodeId',n.node_id,
    'role',n.champion_role,'championId',n.champion_id,'disabledReason',n.disabled_reason,
    'availability',CASE WHEN NOT n.active THEN 'disabled'
      WHEN n.eligibility->>'gate'='champion_specializations' AND NOT (SELECT champion_specializations_enabled FROM private.enhancement_contract_settings WHERE singleton) THEN 'gated'
      WHEN NOT private.enhancement_requirement_satisfied(private.enhancement_node_requirement(n),
        COALESCE((SELECT jsonb_object_agg(node_id,max_rank) FROM public.enhancement_node_catalog parent
          WHERE parent.ruleset_version=n.ruleset_version AND parent.active AND parent.champion_role=n.champion_role
            AND (parent.champion_id IS NULL OR parent.champion_id=COALESCE(n.champion_id,(SELECT champion_id FROM public.progression_champion_catalog WHERE ruleset_version=n.ruleset_version AND primary_role=n.champion_role AND active ORDER BY champion_id LIMIT 1)))
            AND NOT (n.eligibility->'exclusiveWith') ? parent.node_id),'{}'::jsonb),
        n.ruleset_version,n.champion_role,COALESCE(n.champion_id,(SELECT champion_id FROM public.progression_champion_catalog WHERE ruleset_version=n.ruleset_version AND primary_role=n.champion_role AND active ORDER BY champion_id LIMIT 1)),ARRAY[n.node_id],4)
        THEN 'dependency_blocked' ELSE 'available' END) ORDER BY n.node_id)
    FROM public.enhancement_node_catalog n WHERE n.ruleset_version=(SELECT version FROM public.progression_rulesets WHERE is_active)),'[]'::jsonb),
  'purchases',jsonb_build_object('basis','share_of_purchasers','exposure','not_collected','scope','date_progression_champion',
    'commands',t.commands,'resets',t.resets,'uniquePurchasers',t.purchasers,'spent',t.spent,'refunded',t.refunded,
    'attestedSpend',t.attested_spend,'unclassifiedCommands',t.unclassified,'ledgerComplete',t.complete,
    'ledgerCoverageStartedAt',(SELECT private.admin_analytics_timestamp(started_at) FROM public.candy_ledger_settings WHERE singleton),
    'nodes',COALESCE((SELECT jsonb_agg(jsonb_build_object('catalogVersion',ruleset_version,'nodeId',node_id,'role',champion_role,'championId',champion,
      'purchases',purchases,'players',players,'purchaserShare',CASE WHEN t.purchasers>=30 AND players>=30 THEN players::numeric/t.purchasers ELSE NULL END,
      'insufficientSample',t.purchasers<30 OR players<30) ORDER BY ruleset_version,node_id,champion) FROM node_counts),'[]'::jsonb),
    'branches',COALESCE((SELECT jsonb_agg(jsonb_build_object('catalogVersion',ruleset_version,'branchId',branch_id,'role',champion_role,'championId',champion,
      'purchases',purchases,'players',players,'purchaserShare',CASE WHEN t.purchasers>=30 AND players>=30 THEN players::numeric/t.purchasers ELSE NULL END,
      'insufficientSample',t.purchasers<30 OR players<30) ORDER BY ruleset_version,branch_id,champion) FROM branch_counts),'[]'::jsonb)),
  'builds',COALESCE((SELECT jsonb_agg(jsonb_build_object('contextId',context_id,'segmentId',segment_id,'championId',champion_id,
    'snapshotHash',snapshot_hash,'ranks',ranks,'nodeIds',(SELECT COALESCE(jsonb_agg(key ORDER BY key),'[]'::jsonb) FROM jsonb_each(ranks)),
    'state',state,'runs',runs,'players',players,'wins',wins,
    'winRate',CASE WHEN players>=30 AND runs>=30 AND state<>'partial' THEN wins::numeric/runs ELSE NULL END,
    'interval95',private.admin_tree_interval(wins,runs,players,state<>'partial'),
    'insufficientSample',players<30 OR runs<30 OR state='partial',
    'rateStatus',CASE WHEN players<30 OR runs<30 OR state='partial' THEN 'insufficient_sample'
      WHEN players<runs THEN 'repeated_players' ELSE 'descriptive' END)
    ORDER BY runs DESC,context_id,champion_id,snapshot_hash,state) FROM limited_builds),'[]'::jsonb),
  'cardinality',jsonb_build_object('buildLimit',200,'totalBuilds',(SELECT count(*) FROM builds),'buildsTruncated',(SELECT count(*)>200 FROM builds))
) FROM totals t
$$;
REVOKE ALL ON FUNCTION private.admin_balance_tree_data(JSONB,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.admin_balance(p_resource TEXT, p_filters JSONB, p_snapshot TIMESTAMPTZ)
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
    OR p_resource NOT IN ('champions', 'builds', 'config', 'trees')
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
  WHEN p_resource = 'trees' THEN
    private.admin_balance_tree_data(f, stamp)
  ELSE
    private.admin_balance_build_data(f, stamp)
  END;
  IF jsonb_array_length(data -> 'segments') > 32
    OR jsonb_array_length(data -> 'contexts') > 128
    OR jsonb_array_length(data -> 'rows') > 1024
    OR (p_resource = 'trees' AND (
      jsonb_array_length(data -> 'purchases' -> 'nodes') > 1024
      OR jsonb_array_length(data -> 'purchases' -> 'branches') > 1024
      OR jsonb_array_length(data -> 'catalogue') > 1024
    )) THEN
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

CREATE FUNCTION public.admin_balance_trees(p_filters JSONB,p_snapshot TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT private.admin_balance('trees',p_filters,p_snapshot)
$$;
REVOKE ALL ON FUNCTION public.admin_balance_trees(JSONB,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_balance_trees(JSONB,TIMESTAMPTZ) TO authenticated;
COMMENT ON FUNCTION public.admin_balance_trees(JSONB,TIMESTAMPTZ) IS
  'ADM-20 aggregate tree receipts and frozen verified builds. No PII or wallet mutation. Purchase scope is date/progression/champion; gameplay filters apply only to verified runs. Repeated-player intervals unavailable.';

-- Replace only TREE-10 availability metadata; retain the original config projection.
ALTER FUNCTION private.admin_balance_config_data(TIMESTAMPTZ) RENAME TO admin_balance_config_before_trees;
CREATE FUNCTION private.admin_balance_config_data(stamp TIMESTAMPTZ)
RETURNS JSONB LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT private.admin_balance_config_before_trees(stamp)||jsonb_build_object('trees',jsonb_build_object(
    'status','available','catalogVersion',(SELECT version FROM public.progression_rulesets WHERE is_active),'contractSchemaVersion',1))
$$;
REVOKE ALL ON FUNCTION private.admin_balance_config_data(TIMESTAMPTZ) FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON FUNCTION public.admin_balance_config() IS 'Read-only administrator rules, economy and available TREE-10 contract metadata; no rule mutation.';
COMMIT;
