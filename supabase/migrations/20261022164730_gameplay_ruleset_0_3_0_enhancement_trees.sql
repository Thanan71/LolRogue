-- TREE-04: semantic engine 0.3.0 / gameplay 25 uses the attested catalogue 4.
-- Historical snapshots and reward contracts remain immutable.
BEGIN;

INSERT INTO public.gameplay_rulesets (
  version, code, engine_version, command_schema_version, content_hash, is_active
)
VALUES (
  25,
  '0.3.0',
  'run-engine-0.3.0',
  2,
  '0000000000000000000000000000000000000000000000000000000000000000',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_rulesets
    WHERE version = 25
      AND code = '0.3.0'
      AND engine_version = 'run-engine-0.3.0'
      AND command_schema_version = 2
      AND content_hash =
        '0000000000000000000000000000000000000000000000000000000000000000'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_0_3_0_contract_mismatch';
  END IF;
END
$$;

-- A frozen snapshot activates legal ownership, independent of purchase publication
-- flags. Invalid historical ranks remain in the account for audited compensation.
CREATE FUNCTION private.active_enhancement_snapshot(raw_snapshot JSONB,mastery_snapshot JSONB,catalog SMALLINT)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE champion RECORD; node public.enhancement_node_catalog; raw JSONB; candidates JSONB;
  active JSONB; result JSONB:='{}'::jsonb; mastery INTEGER; changed BOOLEAN;
BEGIN
  IF jsonb_typeof(raw_snapshot) IS DISTINCT FROM 'object' OR
    jsonb_typeof(mastery_snapshot) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_enhancement_snapshot' USING ERRCODE='22023'; END IF;
  FOR champion IN SELECT c.champion_id,c.primary_role FROM public.progression_champion_catalog c
    WHERE c.ruleset_version=catalog AND c.active ORDER BY c.champion_id
  LOOP
    IF NOT raw_snapshot ? champion.champion_id THEN CONTINUE; END IF;
    raw:=raw_snapshot->champion.champion_id; candidates:='{}'::jsonb; active:='{}'::jsonb;
    mastery:=CASE WHEN jsonb_typeof(mastery_snapshot->champion.champion_id)='number'
      AND mastery_snapshot->>champion.champion_id ~ '^[0-4]$'
      THEN (mastery_snapshot->>champion.champion_id)::integer ELSE 0 END;
    IF jsonb_typeof(raw)='object' THEN
      FOR node IN SELECT * FROM public.enhancement_node_catalog n
        WHERE n.ruleset_version=catalog AND n.active AND n.champion_role=champion.primary_role
          AND (n.champion_id IS NULL OR n.champion_id=champion.champion_id)
          AND n.required_mastery_level<=mastery ORDER BY n.node_id
      LOOP
        IF jsonb_typeof(raw->node.node_id) IS DISTINCT FROM 'number' OR
          NOT COALESCE(raw->>node.node_id ~ '^[1-9][0-9]{0,8}$',FALSE) THEN CONTINUE; END IF;
        IF (raw->>node.node_id)::numeric>node.max_rank THEN CONTINUE; END IF;
        -- Check original ownership: two conflicting paths must both be inactive,
        -- even if removing one would otherwise make the other appear legal.
        IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(node.eligibility->'exclusiveWith') x
          WHERE jsonb_typeof(raw->x)='number' AND (raw->>x)::numeric>0) THEN CONTINUE; END IF;
        candidates:=candidates||jsonb_build_object(node.node_id,raw->node.node_id);
      END LOOP;
      changed:=TRUE;
      WHILE changed LOOP
        changed:=FALSE;
        FOR node IN SELECT * FROM public.enhancement_node_catalog n
          WHERE n.ruleset_version=catalog AND candidates ? n.node_id ORDER BY n.node_id
        LOOP
          IF active ? node.node_id THEN CONTINUE; END IF;
          IF private.enhancement_requirement_satisfied(private.enhancement_node_requirement(node),
            active,catalog,champion.primary_role,champion.champion_id,ARRAY[node.node_id],mastery) THEN
            active:=active||jsonb_build_object(node.node_id,candidates->node.node_id); changed:=TRUE;
          END IF;
        END LOOP;
      END LOOP;
    END IF;
    result:=result||jsonb_build_object(champion.champion_id,active);
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.active_enhancement_snapshot(JSONB,JSONB,SMALLINT) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.freeze_run_attempt_enhancements_v25()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.engine_version<>'run-engine-0.3.0' THEN RETURN NEW; END IF;
  IF NEW.gameplay_ruleset_version<>25 OR NEW.ruleset_version<>4 THEN
    RAISE EXCEPTION 'enhancement_run_contract_mismatch' USING ERRCODE='22023'; END IF;
  IF NEW.mode='daily' THEN NEW.enhancement_snapshot:='{}'::jsonb;
  ELSE NEW.enhancement_snapshot:=private.active_enhancement_snapshot(NEW.enhancement_snapshot,NEW.mastery_snapshot,4::smallint);
  END IF;
  -- Exactly the mastery-freeze initial journal fields; never hash a loadout DTO.
  NEW.journal_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'attempt_id',NEW.id,'ruleset_version',NEW.ruleset_version,
    'gameplay_ruleset_version',NEW.gameplay_ruleset_version,'engine_version',NEW.engine_version,
    'seed',NEW.seed,'mode',NEW.mode,'difficulty',NEW.difficulty,'initial_team',to_jsonb(NEW.initial_team),
    'rune_ids',to_jsonb(NEW.rune_ids),'enhancement_snapshot',NEW.enhancement_snapshot,
    'mastery_snapshot',NEW.mastery_snapshot)::text,'UTF8'),'sha256'),'hex');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.freeze_run_attempt_enhancements_v25() FROM PUBLIC,anon,authenticated,service_role;
-- PostgreSQL orders same-event triggers by name: run_attempts_zz_freeze_mastery
-- supplies the actual authoritative mastery before this INSERT-only projection.
CREATE TRIGGER run_attempts_zzz_freeze_enhancements_v25 BEFORE INSERT ON public.run_attempts
  FOR EACH ROW EXECUTE FUNCTION public.freeze_run_attempt_enhancements_v25();

-- The oldest start helper builds a response before BEFORE INSERT triggers run.
-- Return the stored filtered snapshot for 0.3.0; historical responses stay exact.
CREATE OR REPLACE FUNCTION public.start_run_attempt(p_command_id UUID,p_team TEXT[],p_rune_ids TEXT[],p_difficulty TEXT,p_mode TEXT DEFAULT 'normal')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE response JSONB; attempt public.run_attempts;
BEGIN
  response:=public.start_run_attempt_pre_champion_economy(p_command_id,p_team,p_rune_ids,p_difficulty,p_mode);
  SELECT * INTO STRICT attempt FROM public.run_attempts WHERE id=(response->>'attempt_id')::uuid;
  IF attempt.engine_version='run-engine-0.3.0' THEN response:=response||jsonb_build_object('enhancement_snapshot',attempt.enhancement_snapshot); END IF;
  RETURN response||jsonb_build_object('champion_access_snapshot',attempt.champion_access_snapshot,'economy_version',attempt.economy_version);
END;
$$;
REVOKE ALL ON FUNCTION public.start_run_attempt(UUID,TEXT[],TEXT[],TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_run_attempt(UUID,TEXT[],TEXT[],TEXT,TEXT) TO authenticated;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version, content_type, content_id, active, max_stacks
)
SELECT 25, content_type, content_id, active, max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 24
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active, max_stacks = EXCLUDED.max_stacks;

DO $$
BEGIN
  IF EXISTS (
    (
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 24
      EXCEPT
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 25
    )
    UNION ALL
    (
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 25
      EXCEPT
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 24
    )
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_0_3_0_catalog_copy_mismatch';
  END IF;
END
$$;

INSERT INTO public.daily_challenge_rulesets (
  version, code, gameplay_ruleset_version, difficulty, seed_namespace,
  score_version, wave_points, biome_points, run_level_points, gold_points,
  victory_bonus, is_active
)
SELECT
  25,
  'daily-0.3.0',
  25,
  difficulty,
  'lolrogue.daily.0.3.0',
  15,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 24
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_rulesets
    WHERE version = 25
      AND code = 'daily-0.3.0'
      AND gameplay_ruleset_version = 25
      AND seed_namespace = 'lolrogue.daily.0.3.0'
      AND score_version = 15
      AND gold_points = 0
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_0_3_0_contract_mismatch';
  END IF;

  IF EXISTS (
    (
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 24
      EXCEPT
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 25
    )
    UNION ALL
    (
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 25
      EXCEPT
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 24
    )
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_0_3_0_copy_mismatch';
  END IF;
END
$$;

-- Catalogue 4 changes eligibility, not the participation reward economy. This
-- exact assertion is required before borrowing the immutable v3 allocator.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.progression_rulesets old JOIN public.progression_rulesets current ON current.version=4
    WHERE old.version=3 AND ROW(old.base_candies,old.candies_per_wave,old.candies_per_biome,old.victory_bonus,
      old.max_team_size,old.max_run_level,old.min_victory_waves,old.max_waves_by_biome)
    IS NOT DISTINCT FROM ROW(current.base_candies,current.candies_per_wave,current.candies_per_biome,current.victory_bonus,
      current.max_team_size,current.max_run_level,current.min_victory_waves,current.max_waves_by_biome)) THEN
    RAISE EXCEPTION 'enhancement_progression_economy_mismatch'; END IF;
END $$;

ALTER FUNCTION public.complete_run_verification_pre_champion_economy(UUID,UUID,JSONB,TEXT) SET SCHEMA private;
ALTER FUNCTION private.complete_run_verification_pre_champion_economy(UUID,UUID,JSONB,TEXT) RENAME TO complete_run_verification_before_trees;
REVOKE ALL ON FUNCTION private.complete_run_verification_before_trees(UUID,UUID,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.complete_run_verification_pre_champion_economy(
  p_attempt_id UUID,p_lease_token UUID,p_result JSONB,p_result_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE attempt public.run_attempts; v_response JSONB; result_hash TEXT; previous public.gameplay_rulesets;
BEGIN
  SELECT * INTO attempt FROM public.run_attempts WHERE id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE='P0002'; END IF;
  IF attempt.engine_version<>'run-engine-0.3.0' THEN
    RETURN private.complete_run_verification_before_trees(p_attempt_id,p_lease_token,p_result,p_result_hash);
  END IF;
  IF attempt.ruleset_version<>4 OR attempt.gameplay_ruleset_version<>25 OR attempt.command_schema_version<>2
    OR NOT EXISTS(SELECT 1 FROM public.gameplay_rulesets g WHERE g.version=25 AND g.engine_version=attempt.engine_version
      AND g.command_schema_version=2 AND g.content_hash=attempt.gameplay_content_hash) THEN
    RAISE EXCEPTION 'enhancement_run_contract_mismatch' USING ERRCODE='22023'; END IF;
  IF p_result IS NULL OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid_verified_result' USING ERRCODE='22023'; END IF;
  IF p_result_hash IS NOT NULL AND p_result_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_result_hash' USING ERRCODE='22023'; END IF;
  result_hash:=encode(extensions.digest(convert_to(p_result::text,'UTF8'),'sha256'),'hex');
  IF attempt.status='verified' THEN
    IF attempt.lease_token IS DISTINCT FROM p_lease_token OR attempt.result_hash IS DISTINCT FROM result_hash THEN
      RAISE EXCEPTION 'verified_result_conflict' USING ERRCODE='22023'; END IF;
    RETURN jsonb_set(attempt.response,'{replayed}','true'::jsonb,TRUE);
  END IF;
  IF attempt.status='rejected' THEN RETURN COALESCE(attempt.response,jsonb_build_object('attempt_id',attempt.id,
    'run_uuid',attempt.run_uuid,'status','rejected','accepted',FALSE,'rejection_code',attempt.rejection_code)); END IF;
  IF attempt.status<>'finished' OR attempt.lease_token IS DISTINCT FROM p_lease_token
    OR attempt.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'verification_lease_invalid' USING ERRCODE='55000'; END IF;
  SELECT * INTO STRICT previous FROM public.gameplay_rulesets WHERE version=24;
  -- Transaction-local compatibility projection under the attempt row lock. The
  -- original helper checks every ledger/member/lease and performs the real v3
  -- largest-remainder allocation. Other transactions can only see final 25/4.
  -- Any exception rolls back all temporary identities and all reward mutations.
  -- No snapshot, mastery, journal hash, ownership or historical row is rewritten.
  UPDATE public.run_attempts SET engine_version=previous.engine_version,gameplay_ruleset_version=24,
    gameplay_content_hash=previous.content_hash,ruleset_version=3 WHERE id=p_attempt_id;
  v_response:=private.complete_run_verification_before_trees(p_attempt_id,p_lease_token,p_result,p_result_hash);
  UPDATE public.run_attempts SET engine_version=attempt.engine_version,gameplay_ruleset_version=attempt.gameplay_ruleset_version,
    gameplay_content_hash=attempt.gameplay_content_hash,ruleset_version=attempt.ruleset_version WHERE id=p_attempt_id;
  IF v_response->>'status'='verified' THEN
    v_response:=v_response||jsonb_build_object('progression_version',4,'gameplay_ruleset_version',25,'engine_version',attempt.engine_version);
    UPDATE public.runs SET progression_version=4 WHERE id=(v_response->>'run_id')::uuid AND run_attempt_id=p_attempt_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'verified_run_not_found' USING ERRCODE='P0002'; END IF;
    UPDATE public.run_attempts SET response=v_response WHERE id=p_attempt_id;
  END IF;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_run_verification_pre_champion_economy(UUID,UUID,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;

-- Publish gameplay and Daily together after all compatibility and snapshot rules
-- exist. The champion specialization publication flag remains false by default.
UPDATE public.champion_economy_config SET gameplay_ruleset_version=25,updated_at=clock_timestamp() WHERE singleton;
UPDATE public.gameplay_rulesets SET is_active=FALSE WHERE is_active;
UPDATE public.gameplay_rulesets SET is_active=TRUE WHERE version=25;
UPDATE public.daily_challenge_rulesets SET is_active=FALSE WHERE is_active;
UPDATE public.daily_challenge_rulesets SET is_active=TRUE WHERE version=25;
COMMIT;

