-- TREE-02/05: immutable catalogue v4 and canonical declarative purchase rules.
-- Existing ranks and historical command responses are retained verbatim.
BEGIN;

ALTER TABLE public.enhancement_node_catalog
  ADD COLUMN champion_id TEXT,
  ADD COLUMN disabled_reason TEXT,
  ADD COLUMN eligibility JSONB NOT NULL DEFAULT
    '{"schemaVersion":1,"exclusiveWith":[],"budget":null}'::JSONB,
  ADD CONSTRAINT enhancement_eligibility_object CHECK (
    jsonb_typeof(eligibility)='object' AND eligibility->>'schemaVersion'='1'
    AND jsonb_typeof(eligibility->'exclusiveWith')='array'
    AND (eligibility->'budget'='null'::jsonb OR
      (jsonb_typeof(eligibility->'budget')='number' AND
       (eligibility->>'budget') ~ '^[1-9][0-9]*$'))
  ),
  ADD CONSTRAINT enhancement_champion_contract_fk FOREIGN KEY(ruleset_version,champion_id)
    REFERENCES public.progression_champion_catalog(ruleset_version,champion_id);
ALTER TABLE public.champion_enhancements
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  ADD COLUMN reset_count INTEGER NOT NULL DEFAULT 0 CHECK(reset_count>=0);

CREATE TABLE private.enhancement_contract_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
  champion_specializations_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_reset_fee_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK(repeat_reset_fee_basis_points BETWEEN 0 AND 10000),
  reset_policy_version INTEGER NOT NULL DEFAULT 1 CHECK(reset_policy_version>0)
);
INSERT INTO private.enhancement_contract_settings DEFAULT VALUES;
ALTER TABLE private.enhancement_contract_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.enhancement_contract_settings FROM PUBLIC,anon,authenticated,service_role;

UPDATE public.progression_rulesets SET is_active=FALSE WHERE is_active;
INSERT INTO public.progression_rulesets(version,code,is_active,base_candies,candies_per_wave,
  candies_per_biome,victory_bonus,max_team_size,max_run_level,min_victory_waves,max_waves_by_biome)
SELECT 4,'0.3.0-enhancement-contract',FALSE,base_candies,candies_per_wave,candies_per_biome,
  victory_bonus,max_team_size,max_run_level,min_victory_waves,max_waves_by_biome
FROM public.progression_rulesets WHERE version=3;
INSERT INTO public.progression_champion_catalog(ruleset_version,champion_id,primary_role,active)
SELECT 4,champion_id,primary_role,active FROM public.progression_champion_catalog WHERE ruleset_version=3;
INSERT INTO public.enhancement_node_catalog(ruleset_version,node_id,champion_role,candy_cost,max_rank,
  required_mastery_level,prerequisite_node_ids,active,champion_id,disabled_reason,eligibility)
SELECT 4,node_id,champion_role,candy_cost,max_rank,required_mastery_level,prerequisite_node_ids,
  CASE WHEN node_id=ANY(ARRAY['assassin_mobility_1','assassin_mobility_2','assassin_mobility_3',
    'fighter_duelist_1','mage_burst_3','marksman_survival_3','support_tanky_3',
    'support_utility_1','support_utility_2','support_utility_3','tank_support_1','tank_support_3'])
    THEN FALSE ELSE active END,
  NULL,CASE WHEN node_id=ANY(ARRAY['assassin_mobility_1','assassin_mobility_2','assassin_mobility_3',
    'fighter_duelist_1','mage_burst_3','marksman_survival_3','support_tanky_3',
    'support_utility_1','support_utility_2','support_utility_3','tank_support_1','tank_support_3'])
    THEN 'unsupported_combat_mechanic' ELSE NULL END,eligibility
FROM public.enhancement_node_catalog WHERE ruleset_version=3;

-- Optional champion extensions reuse the role graph; the shared gate remains OFF
-- until the separately documented human balance gate permits activation.
INSERT INTO public.enhancement_node_catalog(ruleset_version,node_id,champion_role,champion_id,
  candy_cost,max_rank,required_mastery_level,prerequisite_node_ids,eligibility)
SELECT 4,lower(champion)||'_'||path||'_'||rank,role,champion,
  CASE WHEN rank=1 THEN 80 ELSE 120 END,1,CASE WHEN rank=1 THEN 2 ELSE 3 END,
  CASE WHEN rank=1 THEN ARRAY[]::text[] ELSE ARRAY[lower(champion)||'_'||path||'_1'] END,
  jsonb_build_object('schemaVersion',1,'gate','champion_specializations','budget',NULL,
    'exclusiveWith',jsonb_build_array(lower(champion)||'_'||other_path||'_1',lower(champion)||'_'||other_path||'_2'))
FROM (VALUES ('Garen','fighter','durability','execution'),('Garen','fighter','execution','durability'),
  ('Annie','mage','burst','control'),('Annie','mage','control','burst'),
  ('Soraka','support','healing','protection'),('Soraka','support','protection','healing'),
  ('Jinx','marksman','sustained','finisher'),('Jinx','marksman','finisher','sustained'))
  AS paths(champion,role,path,other_path) CROSS JOIN generate_series(1,2) AS ranks(rank);
UPDATE public.progression_rulesets SET is_active=TRUE WHERE version=4;

CREATE FUNCTION private.enhancement_require_account()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID := (SELECT auth.uid());
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE='28000'; END IF;
  IF COALESCE((SELECT is_anonymous FROM auth.users WHERE id=u),TRUE) THEN
    RAISE EXCEPTION 'registered_account_required' USING ERRCODE='42501';
  END IF;
  RETURN u;
END;
$$;
REVOKE ALL ON FUNCTION private.enhancement_require_account() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.enhancement_node_requirement(n public.enhancement_node_catalog)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT COALESCE(n.eligibility->'requirement',jsonb_build_object('kind','and','conditions',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind','node','nodeId',p,'minRank',1))
      FROM unnest(n.prerequisite_node_ids) p),'[]'::jsonb)))
$$;
REVOKE ALL ON FUNCTION private.enhancement_node_requirement(public.enhancement_node_catalog)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.enhancement_requirement_satisfied(
  requirement JSONB, owned JSONB, catalog SMALLINT, role_name TEXT, champion TEXT,
  seen TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE part JSONB; parent public.enhancement_node_catalog; minimum INTEGER;
  found_match BOOLEAN:=FALSE; kind TEXT:=requirement->>'kind';
BEGIN
  IF cardinality(seen)>64 OR jsonb_typeof(requirement)<>'object' THEN RETURN FALSE; END IF;
  IF kind='node' THEN
    IF jsonb_typeof(requirement->'nodeId')<>'string' OR
      NOT COALESCE(requirement->>'minRank','1') ~ '^[1-9][0-9]*$' THEN RETURN FALSE; END IF;
    minimum:=COALESCE(requirement->>'minRank','1')::integer;
    IF (requirement->>'nodeId')=ANY(seen) THEN RETURN FALSE; END IF;
    SELECT * INTO parent FROM public.enhancement_node_catalog
    WHERE ruleset_version=catalog AND node_id=requirement->>'nodeId' AND active
      AND champion_role=role_name AND (champion_id IS NULL OR champion_id=champion);
    IF NOT FOUND OR minimum>parent.max_rank OR jsonb_typeof(owned->parent.node_id)<>'number'
      OR NOT (owned->>parent.node_id) ~ '^[1-9][0-9]*$'
      OR (owned->>parent.node_id)::integer<minimum THEN RETURN FALSE; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(parent.eligibility->'exclusiveWith') x
      WHERE jsonb_typeof(owned->x)='number' AND (owned->>x)::numeric>0) THEN RETURN FALSE; END IF;
    RETURN private.enhancement_requirement_satisfied(private.enhancement_node_requirement(parent),
      owned,catalog,role_name,champion,array_append(seen,parent.node_id));
  ELSIF kind IN ('and','or') THEN
    IF jsonb_typeof(requirement->'conditions')<>'array' THEN RETURN FALSE; END IF;
    IF jsonb_array_length(requirement->'conditions')=0 THEN RETURN kind='and'; END IF;
    FOR part IN SELECT value FROM jsonb_array_elements(requirement->'conditions') LOOP
      IF private.enhancement_requirement_satisfied(part,owned,catalog,role_name,champion,seen) THEN
        found_match:=TRUE; IF kind='or' THEN RETURN TRUE; END IF;
      ELSIF kind='and' THEN RETURN FALSE; END IF;
    END LOOP;
    RETURN kind='and' OR found_match;
  END IF;
  RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION private.enhancement_requirement_satisfied(JSONB,JSONB,SMALLINT,TEXT,TEXT,TEXT[])
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_enhancement_contract()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.enhancement_require_account();
  RETURN (SELECT jsonb_build_object('catalog_version',(SELECT version FROM public.progression_rulesets WHERE is_active),
    'contract_schema_version',1,'champion_specializations_enabled',champion_specializations_enabled,
    'repeat_reset_fee_basis_points',repeat_reset_fee_basis_points,'reset_policy_version',reset_policy_version)
    FROM private.enhancement_contract_settings WHERE singleton);
END;
$$;
REVOKE ALL ON FUNCTION public.get_enhancement_contract() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_enhancement_contract() TO authenticated;

CREATE FUNCTION private.purchase_enhancement_v4(
  champion TEXT,node TEXT,expected_rank INTEGER,expected_revision INTEGER,command UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u UUID:=private.enhancement_require_account(); p public.players;
  e public.champion_enhancements; n public.enhancement_node_catalog;
  old public.progression_commands; catalog SMALLINT; payload JSONB; payload_hash TEXT;
  rank INTEGER:=0; mastery INTEGER:=0; parent TEXT; v_response JSONB;
BEGIN
  IF command IS NULL OR expected_rank IS NULL OR expected_rank<0 OR
    (expected_revision IS NOT NULL AND expected_revision<0) OR
    btrim(COALESCE(champion,''))='' OR btrim(COALESCE(node,''))='' THEN
    RAISE EXCEPTION 'invalid_enhancement_request' USING ERRCODE='22023'; END IF;
  SELECT * INTO p FROM public.players WHERE user_id=u FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO old FROM public.progression_commands WHERE user_id=u AND command_id=command;
  SELECT version INTO catalog FROM public.progression_rulesets WHERE is_active;
  IF catalog IS NULL THEN RAISE EXCEPTION 'active_progression_ruleset_not_found' USING ERRCODE='P0002'; END IF;
  payload:=jsonb_build_object('ruleset_version',COALESCE(old.ruleset_version,catalog),
    'champion_id',champion,'node_id',node,'expected_rank',expected_rank);
  IF expected_revision IS NOT NULL THEN payload:=payload||jsonb_build_object('expected_revision',expected_revision); END IF;
  payload_hash:=encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex');
  IF old.command_id IS NOT NULL THEN
    IF old.command_type<>'enhancement_unlock' OR old.payload_hash<>payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='22023'; END IF;
    IF old.response IS NULL THEN RAISE EXCEPTION 'command_in_progress' USING ERRCODE='55000'; END IF;
    RETURN jsonb_set(old.response,'{replayed}','true'::jsonb,TRUE);
  END IF;
  SELECT n1.* INTO n FROM public.enhancement_node_catalog n1
  JOIN public.progression_champion_catalog c ON c.ruleset_version=n1.ruleset_version
    AND c.primary_role=n1.champion_role AND c.champion_id=champion AND c.active
  WHERE n1.ruleset_version=catalog AND n1.node_id=node AND n1.active
    AND (n1.champion_id IS NULL OR n1.champion_id=champion);
  IF NOT FOUND THEN RAISE EXCEPTION 'enhancement_not_in_champion_catalog' USING ERRCODE='22023'; END IF;
  IF n.eligibility->>'gate'='champion_specializations' AND NOT
    (SELECT champion_specializations_enabled FROM private.enhancement_contract_settings WHERE singleton)
    THEN RAISE EXCEPTION 'enhancement_feature_disabled' USING ERRCODE='22023'; END IF;
  SELECT public.mastery_level_from_candies(total_candies) INTO mastery
  FROM public.champion_mastery WHERE player_id=p.id AND champion_id=champion;
  IF COALESCE(mastery,0)<n.required_mastery_level THEN
    RAISE EXCEPTION 'mastery_level_required' USING ERRCODE='22023'; END IF;
  IF p.total_candies<n.candy_cost THEN RAISE EXCEPTION 'insufficient_candies' USING ERRCODE='22003'; END IF;
  INSERT INTO public.champion_enhancements(user_id,champion_id) VALUES(u,champion)
    ON CONFLICT(user_id,champion_id) DO NOTHING;
  SELECT * INTO e FROM public.champion_enhancements WHERE user_id=u AND champion_id=champion FOR UPDATE;
  IF expected_revision IS NOT NULL AND e.revision<>expected_revision THEN
    RAISE EXCEPTION 'enhancement_revision_conflict' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(e.unlocked_nodes->node)='number' THEN rank:=(e.unlocked_nodes->>node)::integer; END IF;
  IF rank<>expected_rank THEN RAISE EXCEPTION 'enhancement_rank_conflict' USING ERRCODE='22023'; END IF;
  IF rank>=n.max_rank THEN RAISE EXCEPTION 'enhancement_max_rank' USING ERRCODE='22023'; END IF;
  IF NOT private.enhancement_requirement_satisfied(private.enhancement_node_requirement(n),
    e.unlocked_nodes,catalog,n.champion_role,champion,ARRAY[node]) THEN
    FOREACH parent IN ARRAY n.prerequisite_node_ids LOOP
      IF COALESCE((e.unlocked_nodes->>parent)::integer,0)<1 THEN
        RAISE EXCEPTION 'enhancement_prerequisite_required:%',parent USING ERRCODE='22023'; END IF;
    END LOOP;
    RAISE EXCEPTION 'enhancement_requirement_required' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(n.eligibility->'exclusiveWith') x
    WHERE jsonb_typeof(e.unlocked_nodes->x)='number' AND (e.unlocked_nodes->>x)::numeric>0) THEN
    RAISE EXCEPTION 'enhancement_exclusive_conflict' USING ERRCODE='22023'; END IF;
  IF n.eligibility->'budget'<>'null'::jsonb AND
    e.total_candies_spent::bigint+n.candy_cost>(n.eligibility->>'budget')::bigint THEN
    RAISE EXCEPTION 'enhancement_budget_exceeded' USING ERRCODE='22023'; END IF;
  INSERT INTO public.progression_commands(user_id,command_id,command_type,ruleset_version,payload_hash)
    VALUES(u,command,'enhancement_unlock',catalog,payload_hash);
  UPDATE public.players SET total_candies=total_candies-n.candy_cost WHERE id=p.id RETURNING * INTO p;
  UPDATE public.champion_enhancements SET unlocked_nodes=jsonb_set(unlocked_nodes,ARRAY[node],to_jsonb(rank+1),TRUE),
    total_candies_spent=total_candies_spent+n.candy_cost,revision=revision+1 WHERE id=e.id RETURNING * INTO e;
  v_response:=jsonb_build_object('command_id',command,'champion_id',champion,'node_id',node,'current_rank',rank+1,
    'candy_cost',n.candy_cost,'max_rank',n.max_rank,'unlocked_nodes',e.unlocked_nodes,
    'total_candies_spent',e.total_candies_spent,'remaining_candies',p.total_candies,
    'catalog_version',catalog,'contract_schema_version',1,'revision',e.revision,'reset_count',e.reset_count,'replayed',FALSE);
  PERFORM private.record_candy_transaction(p.id,'spent',-n.candy_cost::bigint,'purchase:'||command::text);
  UPDATE public.progression_commands SET response=v_response,completed_at=clock_timestamp()
    WHERE user_id=u AND command_id=command;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION private.purchase_enhancement_v4(TEXT,TEXT,INTEGER,INTEGER,UUID)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.unlock_champion_enhancement(
  p_champion_id TEXT,p_node_id TEXT,p_expected_rank INTEGER,p_command_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN private.purchase_enhancement_v4(p_champion_id,p_node_id,p_expected_rank,NULL,p_command_id);
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_champion_enhancement(TEXT,TEXT,INTEGER,UUID)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement(TEXT,TEXT,INTEGER,UUID) TO authenticated;

CREATE FUNCTION public.unlock_champion_enhancement_v2(
  p_champion_id TEXT,p_node_id TEXT,p_expected_rank INTEGER,p_expected_revision INTEGER,p_command_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_expected_revision IS NULL THEN RAISE EXCEPTION 'invalid_enhancement_request' USING ERRCODE='22023'; END IF;
  RETURN private.purchase_enhancement_v4(p_champion_id,p_node_id,p_expected_rank,p_expected_revision,p_command_id);
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_champion_enhancement_v2(TEXT,TEXT,INTEGER,INTEGER,UUID)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement_v2(TEXT,TEXT,INTEGER,INTEGER,UUID) TO authenticated;

COMMIT;
