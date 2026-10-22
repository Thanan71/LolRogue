-- TREE-07: reversible owned-tree allocation, backed by attested debits only.
-- No mastery, Shards, champion ownership or frozen run snapshot is updated.
BEGIN;
ALTER TABLE public.progression_commands DROP CONSTRAINT progression_commands_command_type_check;
ALTER TABLE public.progression_commands ADD CONSTRAINT progression_commands_command_type_check
  CHECK(command_type IN ('enhancement_unlock','enhancement_reset'));
CREATE INDEX progression_commands_tree_receipts ON public.progression_commands
  (user_id,(response->>'champion_id'),command_type) WHERE completed_at IS NOT NULL;

DROP FUNCTION private.enhancement_requirement_satisfied(JSONB,JSONB,SMALLINT,TEXT,TEXT,TEXT[]);
CREATE FUNCTION private.enhancement_requirement_satisfied(
  requirement JSONB, owned JSONB, catalog SMALLINT, role_name TEXT, champion TEXT,
  seen TEXT[] DEFAULT ARRAY[]::TEXT[], mastery_level INTEGER DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE part JSONB; parent public.enhancement_node_catalog; minimum INTEGER;
  found_match BOOLEAN:=FALSE; kind TEXT:=requirement->>'kind';
BEGIN
  IF mastery_level IS NULL THEN
    SELECT public.mastery_level_from_candies(m.total_candies) INTO mastery_level FROM public.champion_mastery m
      JOIN public.players p ON p.id=m.player_id WHERE p.user_id=(SELECT auth.uid()) AND m.champion_id=champion;
    mastery_level:=COALESCE(mastery_level,0);
  END IF;
  IF cardinality(seen)>64 OR jsonb_typeof(requirement) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
  IF kind='node' THEN
    IF jsonb_typeof(requirement->'nodeId') IS DISTINCT FROM 'string' OR
      NOT COALESCE(requirement->>'minRank','1') ~ '^[1-9][0-9]*$' THEN RETURN FALSE; END IF;
    minimum:=COALESCE(requirement->>'minRank','1')::integer;
    IF (requirement->>'nodeId')=ANY(seen) THEN RETURN FALSE; END IF;
    SELECT * INTO parent FROM public.enhancement_node_catalog
    WHERE ruleset_version=catalog AND node_id=requirement->>'nodeId' AND active
      AND champion_role=role_name AND (champion_id IS NULL OR champion_id=champion);
    IF NOT FOUND OR minimum>parent.max_rank OR mastery_level<parent.required_mastery_level THEN RETURN FALSE; END IF;
    IF jsonb_typeof(owned->parent.node_id) IS DISTINCT FROM 'number'
      OR NOT COALESCE((owned->>parent.node_id) ~ '^[1-9][0-9]*$',FALSE) THEN RETURN FALSE; END IF;
    IF (owned->>parent.node_id)::numeric<minimum OR (owned->>parent.node_id)::numeric>parent.max_rank THEN RETURN FALSE; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(parent.eligibility->'exclusiveWith') x
      WHERE jsonb_typeof(owned->x)='number' AND (owned->>x)::numeric>0) THEN RETURN FALSE; END IF;
    RETURN private.enhancement_requirement_satisfied(private.enhancement_node_requirement(parent),
      owned,catalog,role_name,champion,array_append(seen,parent.node_id),mastery_level);
  ELSIF kind IN ('and','or') THEN
    IF jsonb_typeof(requirement->'conditions') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
    IF jsonb_array_length(requirement->'conditions')=0 THEN RETURN kind='and'; END IF;
    FOR part IN SELECT value FROM jsonb_array_elements(requirement->'conditions') LOOP
      IF private.enhancement_requirement_satisfied(part,owned,catalog,role_name,champion,seen,mastery_level) THEN
        found_match:=TRUE; IF kind='or' THEN RETURN TRUE; END IF;
      ELSIF kind='and' THEN RETURN FALSE; END IF;
    END LOOP;
    RETURN kind='and' OR found_match;
  END IF;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION private.enhancement_requirement_satisfied(JSONB,JSONB,SMALLINT,TEXT,TEXT,TEXT[],INTEGER)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.enhancement_reset_quote(
  p public.players,e public.champion_enhancements,catalog SMALLINT
)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE owned JSONB:=COALESCE(e.unlocked_nodes,'{}'::jsonb); ids JSONB:='[]'::jsonb;
  total BIGINT:=0; traced BIGINT:=0; rank_total BIGINT:=0; complete BOOLEAN:=TRUE;
  valid BOOLEAN:=TRUE; exempt BOOLEAN:=FALSE; settings private.enhancement_contract_settings;
  fee BIGINT:=0; refund BIGINT:=0; eligible BOOLEAN; reason TEXT; history_unavailable BOOLEAN;
BEGIN
  SELECT * INTO STRICT settings FROM private.enhancement_contract_settings WHERE singleton;
  IF jsonb_typeof(owned)<>'object' THEN valid:=FALSE; owned:='{}'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(owned) n WHERE jsonb_typeof(n.value)<>'number'
    OR NOT n.value::text ~ '^[1-9][0-9]{0,8}$') THEN valid:=FALSE; END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key),'[]'::jsonb),COALESCE(sum(
    CASE WHEN value::text ~ '^[1-9][0-9]{0,8}$' THEN (value::text)::bigint ELSE 0 END),0)
    INTO ids,rank_total FROM jsonb_each(owned);
  WITH receipts AS MATERIALIZED(
    SELECT c.command_id,c.created_at,c.response->>'node_id' AS node_id,
      CASE WHEN c.response->>'candy_cost' ~ '^[1-9][0-9]{0,9}$' THEN (c.response->>'candy_cost')::bigint END AS cost,
      CASE WHEN c.response->>'current_rank' ~ '^[1-9][0-9]{0,8}$' THEN (c.response->>'current_rank')::bigint END AS rank
    FROM public.progression_commands c
    WHERE c.user_id=p.user_id AND c.command_type='enhancement_unlock' AND c.completed_at IS NOT NULL
      AND c.response->>'champion_id'=e.champion_id
      AND CASE WHEN COALESCE(c.response->>'reset_count','0') ~ '^[0-9]{1,9}$'
        THEN COALESCE(c.response->>'reset_count','0')::integer ELSE -1 END=COALESCE(e.reset_count,0)
  ), attested AS MATERIALIZED(
    SELECT r.*, (r.cost>0 AND r.rank>0 AND
      (r.created_at<(SELECT started_at FROM public.candy_ledger_settings WHERE singleton)
       OR EXISTS(SELECT 1 FROM public.candy_transactions t WHERE t.player_id=p.id AND t.kind='spent'
         AND t.source_key='purchase:'||r.command_id::text AND t.amount=-r.cost))) AS verified
    FROM receipts r
  ), grouped AS(
    SELECT node_id,count(*) AS n,count(DISTINCT rank) AS ranks,min(rank) AS first,max(rank) AS last,
      bool_and(COALESCE(verified,FALSE)) AS verified
    FROM attested GROUP BY node_id
  )
  SELECT COALESCE(sum(a.cost),0),count(*),
    NOT EXISTS(SELECT 1 FROM grouped g WHERE NOT g.verified OR NOT owned ? g.node_id)
    AND NOT EXISTS(SELECT 1 FROM jsonb_each(owned) n WHERE NOT EXISTS(
      SELECT 1 FROM grouped g WHERE g.node_id=n.key AND n.value::text ~ '^[1-9][0-9]{0,8}$'
        AND g.n=(CASE WHEN n.value::text ~ '^[1-9][0-9]{0,8}$' THEN n.value::text::bigint ELSE 0 END)
        AND g.ranks=g.n AND g.first=1 AND g.last=g.n))
    INTO total,traced,complete FROM attested a;
  complete:=complete AND traced=rank_total;
  history_unavailable:=NOT valid OR NOT complete;
  SELECT EXISTS(SELECT 1 FROM jsonb_each(owned) n LEFT JOIN public.enhancement_node_catalog c
    ON c.ruleset_version=catalog AND c.node_id=n.key
    WHERE c.node_id IS NULL OR NOT c.active OR NOT private.enhancement_requirement_satisfied(
      private.enhancement_node_requirement(c),owned,catalog,c.champion_role,e.champion_id,ARRAY[c.node_id])) INTO exempt;
  IF COALESCE(e.reset_count,0)>0 AND NOT exempt THEN
    fee:=floor(total::numeric*settings.repeat_reset_fee_basis_points/10000)::bigint;
  END IF;
  refund:=GREATEST(0,total-fee);
  reason:=CASE WHEN history_unavailable THEN 'history_unavailable'
    WHEN jsonb_array_length(ids)=0 THEN 'tree_empty'
    WHEN p.total_candies::bigint+refund>2147483647 THEN 'balance_limit' ELSE NULL END;
  eligible:=reason IS NULL;
  RETURN jsonb_build_object('champion_id',e.champion_id,'revision',COALESCE(e.revision,0),
    'catalog_version',catalog,'contract_schema_version',1,'unlocked_nodes',owned,'removed_node_ids',ids,
    'actual_spend',total,'refund_amount',CASE WHEN eligible THEN refund ELSE 0 END,
    'fee_amount',CASE WHEN eligible THEN fee ELSE 0 END,'fee_exempt',exempt,
    'reset_count',COALESCE(e.reset_count,0),'remaining_candies',p.total_candies::bigint+CASE WHEN eligible THEN refund ELSE 0 END,
    'policy_version',settings.reset_policy_version,'eligible',eligible,'history_unavailable',history_unavailable,
    'reason',reason,'active_run_preserved',TRUE);
END;
$$;
REVOKE ALL ON FUNCTION private.enhancement_reset_quote(public.players,public.champion_enhancements,SMALLINT)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_enhancement_reset_preview(p_champion_id TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=private.enhancement_require_account(); p public.players; e public.champion_enhancements; catalog SMALLINT;
BEGIN
  IF btrim(COALESCE(p_champion_id,''))='' THEN RAISE EXCEPTION 'invalid_enhancement_request' USING ERRCODE='22023'; END IF;
  SELECT * INTO p FROM public.players WHERE user_id=u;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found' USING ERRCODE='P0002'; END IF;
  SELECT version INTO catalog FROM public.progression_rulesets WHERE is_active;
  SELECT * INTO e FROM public.champion_enhancements WHERE user_id=u AND champion_id=p_champion_id;
  IF NOT FOUND THEN e.user_id:=u; e.champion_id:=p_champion_id; e.unlocked_nodes:='{}'; e.revision:=0; e.reset_count:=0; END IF;
  RETURN private.enhancement_reset_quote(p,e,catalog);
END;
$$;
REVOKE ALL ON FUNCTION public.get_enhancement_reset_preview(TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enhancement_reset_preview(TEXT) TO authenticated;

CREATE FUNCTION public.reset_champion_enhancements(
  p_champion_id TEXT,p_expected_revision INTEGER,p_command_id UUID,p_expected_policy_version INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=private.enhancement_require_account(); p public.players; e public.champion_enhancements;
  old public.progression_commands; catalog SMALLINT; digest TEXT; quote JSONB; v_response JSONB;
BEGIN
  IF btrim(COALESCE(p_champion_id,''))='' OR p_expected_revision IS NULL OR p_expected_revision<0
    OR p_expected_policy_version IS NULL OR p_expected_policy_version<1 OR p_command_id IS NULL THEN
    RAISE EXCEPTION 'invalid_enhancement_request' USING ERRCODE='22023'; END IF;
  SET CONSTRAINTS public.players_candy_reconciliation,public.transactions_candy_reconciliation DEFERRED;
  SELECT * INTO p FROM public.players WHERE user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO old FROM public.progression_commands WHERE user_id=u AND command_id=p_command_id;
  SELECT version INTO catalog FROM public.progression_rulesets WHERE is_active;
  digest:=encode(extensions.digest(convert_to(jsonb_build_object('ruleset_version',COALESCE(old.ruleset_version,catalog),
    'champion_id',p_champion_id,'expected_revision',p_expected_revision,'policy_version',p_expected_policy_version,
    'operation','enhancement_reset')::text,'UTF8'),'sha256'),'hex');
  IF old.command_id IS NOT NULL THEN
    IF old.command_type<>'enhancement_reset' OR old.payload_hash<>digest THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='22023'; END IF;
    IF old.response IS NULL THEN RAISE EXCEPTION 'command_in_progress' USING ERRCODE='55000'; END IF;
    RETURN jsonb_set(old.response,'{replayed}','true'::jsonb,TRUE);
  END IF;
  SELECT * INTO e FROM public.champion_enhancements WHERE user_id=u AND champion_id=p_champion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'enhancement_tree_empty' USING ERRCODE='22023'; END IF;
  IF e.revision<>p_expected_revision THEN RAISE EXCEPTION 'enhancement_revision_conflict' USING ERRCODE='22023'; END IF;
  quote:=private.enhancement_reset_quote(p,e,catalog);
  IF (quote->>'policy_version')::integer<>p_expected_policy_version THEN
    RAISE EXCEPTION 'enhancement_reset_policy_conflict' USING ERRCODE='22023'; END IF;
  IF NOT (quote->>'eligible')::boolean THEN
    RAISE EXCEPTION 'enhancement_reset_ineligible:%',quote->>'reason' USING ERRCODE='22023'; END IF;
  INSERT INTO public.progression_commands(user_id,command_id,command_type,ruleset_version,payload_hash)
    VALUES(u,p_command_id,'enhancement_reset',catalog,digest);
  UPDATE public.players SET total_candies=total_candies+(quote->>'refund_amount')::integer WHERE id=p.id RETURNING * INTO p;
  PERFORM private.record_candy_transaction(p.id,'refunded',(quote->>'refund_amount')::bigint,'refund:'||p_command_id::text);
  UPDATE public.champion_enhancements SET unlocked_nodes='{}',total_candies_spent=0,
    revision=revision+1,reset_count=reset_count+1 WHERE id=e.id RETURNING * INTO e;
  v_response:=quote||jsonb_build_object('command_id',p_command_id,'replayed',FALSE,'new_revision',e.revision,
    'unlocked_nodes',e.unlocked_nodes,'total_candies_spent',0,'reset_count',e.reset_count,'remaining_candies',p.total_candies);
  UPDATE public.progression_commands SET response=v_response,completed_at=clock_timestamp()
    WHERE user_id=u AND command_id=p_command_id;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_champion_enhancements(TEXT,INTEGER,UUID,INTEGER)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reset_champion_enhancements(TEXT,INTEGER,UUID,INTEGER) TO authenticated;

-- A confirmed price refers to a specific catalogue. Lock that active row until
-- the debit commits; replays retain their original catalogue and receipt.
DROP FUNCTION public.unlock_champion_enhancement_v2(TEXT,TEXT,INTEGER,INTEGER,UUID);
CREATE FUNCTION public.unlock_champion_enhancement_v2(
  p_champion_id TEXT,p_node_id TEXT,p_expected_rank INTEGER,p_expected_revision INTEGER,
  p_command_id UUID,p_expected_catalog_version INTEGER DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=private.enhancement_require_account(); previous public.progression_commands; catalog SMALLINT;
BEGIN
  IF p_expected_catalog_version IS NULL OR p_expected_catalog_version<1 OR p_expected_revision IS NULL THEN
    RAISE EXCEPTION 'invalid_enhancement_request' USING ERRCODE='22023'; END IF;
  SET CONSTRAINTS public.players_candy_reconciliation,public.transactions_candy_reconciliation DEFERRED;
  PERFORM 1 FROM public.players WHERE user_id=u FOR UPDATE;
  SELECT * INTO previous FROM public.progression_commands WHERE user_id=u AND command_id=p_command_id;
  IF FOUND THEN
    IF previous.ruleset_version<>p_expected_catalog_version THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='22023'; END IF;
  ELSE
    SELECT version INTO catalog FROM public.progression_rulesets WHERE is_active FOR SHARE;
    IF catalog IS DISTINCT FROM p_expected_catalog_version THEN
      RAISE EXCEPTION 'enhancement_catalog_conflict' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN private.purchase_enhancement_v4(p_champion_id,p_node_id,p_expected_rank,p_expected_revision,p_command_id);
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_champion_enhancement_v2(TEXT,TEXT,INTEGER,INTEGER,UUID,INTEGER)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement_v2(TEXT,TEXT,INTEGER,INTEGER,UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlock_champion_enhancement(
  p_champion_id TEXT,p_node_id TEXT,p_expected_rank INTEGER,p_command_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  SET CONSTRAINTS public.players_candy_reconciliation,public.transactions_candy_reconciliation DEFERRED;
  RETURN private.purchase_enhancement_v4(p_champion_id,p_node_id,p_expected_rank,NULL,p_command_id);
END;
$$;
COMMIT;
