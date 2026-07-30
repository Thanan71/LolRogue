-- Persist the v7 authority ledger as the common source for run summaries,
-- analytics and champion mastery aggregates.

BEGIN;

ALTER TABLE public.runs
  ADD COLUMN ledger_version SMALLINT NOT NULL DEFAULT 1
    CHECK (ledger_version = 1),
  ADD COLUMN gold_balance INTEGER NOT NULL DEFAULT 0
    CHECK (gold_balance >= 0),
  ADD COLUMN run_ledger JSONB NOT NULL DEFAULT
    '{"version":1,"champions":{},"gold":{"earned":0,"spent":0},"items":[],"next_item_event_sequence":1}'::JSONB
    CHECK (JSONB_TYPEOF(run_ledger) = 'object'),
  ADD COLUMN total_assists BIGINT NOT NULL DEFAULT 0
    CHECK (total_assists >= 0),
  ADD COLUMN total_damage_to_shields BIGINT NOT NULL DEFAULT 0
    CHECK (total_damage_to_shields >= 0),
  ADD COLUMN total_overhealing BIGINT NOT NULL DEFAULT 0
    CHECK (total_overhealing >= 0),
  ADD COLUMN total_shielding_done BIGINT NOT NULL DEFAULT 0
    CHECK (total_shielding_done >= 0),
  ADD COLUMN total_shielding_absorbed BIGINT NOT NULL DEFAULT 0
    CHECK (total_shielding_absorbed >= 0);

ALTER TABLE public.run_team_members
  ADD COLUMN assists INTEGER NOT NULL DEFAULT 0 CHECK (assists >= 0),
  ADD COLUMN damage_to_shields BIGINT NOT NULL DEFAULT 0 CHECK (damage_to_shields >= 0),
  ADD COLUMN overhealing BIGINT NOT NULL DEFAULT 0 CHECK (overhealing >= 0),
  ADD COLUMN shielding_done BIGINT NOT NULL DEFAULT 0 CHECK (shielding_done >= 0),
  ADD COLUMN shielding_absorbed BIGINT NOT NULL DEFAULT 0 CHECK (shielding_absorbed >= 0),
  ADD COLUMN deaths INTEGER NOT NULL DEFAULT 0 CHECK (deaths >= 0);

ALTER TABLE public.champion_mastery
  ADD COLUMN total_assists BIGINT NOT NULL DEFAULT 0 CHECK (total_assists >= 0),
  ADD COLUMN total_damage_received BIGINT NOT NULL DEFAULT 0
    CHECK (total_damage_received >= 0),
  ADD COLUMN total_healing_done BIGINT NOT NULL DEFAULT 0
    CHECK (total_healing_done >= 0),
  ADD COLUMN total_shielding_done BIGINT NOT NULL DEFAULT 0
    CHECK (total_shielding_done >= 0);

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v6;

CREATE FUNCTION public.complete_run_verification(
  p_attempt_id UUID,
  p_lease_token UUID,
  p_result JSONB,
  p_result_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.run_attempts%ROWTYPE;
  v_result_hash TEXT;
  v_legacy_result JSONB;
  v_legacy_members JSONB;
  v_response JSONB;
  v_summary JSONB;
  v_run_id UUID;
  v_member JSONB;
  v_ledger_member JSONB;
  v_champion_id TEXT;
  v_won BOOLEAN;
  v_run_level INTEGER;
  v_gold_earned INTEGER;
  v_gold_spent INTEGER;
  v_gold_balance INTEGER;
  v_kills INTEGER;
  v_assists INTEGER;
  v_damage BIGINT;
  v_damage_to_shields BIGINT;
  v_damage_received BIGINT;
  v_healing_done BIGINT;
  v_healing_received BIGINT;
  v_overhealing BIGINT;
  v_shielding_done BIGINT;
  v_shielding_absorbed BIGINT;
  v_deaths INTEGER;
  v_total_kills BIGINT := 0;
  v_total_assists BIGINT := 0;
  v_total_damage BIGINT := 0;
  v_total_damage_to_shields BIGINT := 0;
  v_total_damage_received BIGINT := 0;
  v_total_healing_done BIGINT := 0;
  v_total_healing_received BIGINT := 0;
  v_total_overhealing BIGINT := 0;
  v_total_shielding_done BIGINT := 0;
  v_total_shielding_absorbed BIGINT := 0;
  v_items_bought INTEGER := 0;
BEGIN
  IF p_result IS NULL OR JSONB_TYPEOF(p_result) <> 'object' THEN
    RAISE EXCEPTION 'invalid_verified_result' USING ERRCODE = '22023';
  END IF;
  v_result_hash := ENCODE(
    extensions.digest(CONVERT_TO(p_result::TEXT, 'UTF8'), 'sha256'::TEXT),
    'hex'
  );

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status = 'verified' THEN
    IF v_attempt.lease_token <> p_lease_token
      OR v_attempt.result_hash <> v_result_hash THEN
      RAISE EXCEPTION 'verified_result_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_SET(v_attempt.response, '{replayed}', 'true'::JSONB, TRUE);
  END IF;

  IF v_attempt.engine_version <> 'run-engine-v7' THEN
    RETURN public.complete_run_verification_v6(
      p_attempt_id,
      p_lease_token,
      p_result,
      p_result_hash
    );
  END IF;

  IF v_attempt.status <> 'finished'
    OR JSONB_TYPEOF(p_result -> 'ledger') IS DISTINCT FROM 'object'
    OR p_result -> 'ledger' ->> 'version' <> '1'
    OR JSONB_TYPEOF(p_result -> 'ledger' -> 'champions') IS DISTINCT FROM 'object'
    OR JSONB_TYPEOF(p_result -> 'ledger' -> 'gold') IS DISTINCT FROM 'object'
    OR JSONB_TYPEOF(p_result -> 'ledger' -> 'items') IS DISTINCT FROM 'array'
    OR JSONB_TYPEOF(p_result -> 'team_members') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_verified_run_ledger' USING ERRCODE = '22023';
  END IF;

  v_won := (p_result ->> 'won')::BOOLEAN;
  v_run_level := public.progression_integer(
    p_result -> 'run_level', 1, 1, 6, 'run_level'
  )::INTEGER;
  v_gold_earned := public.progression_integer(
    p_result -> 'gold_earned', 0, 0, 1000000, 'gold_earned'
  )::INTEGER;
  v_gold_spent := public.progression_integer(
    p_result -> 'gold_spent', 0, 0, 1000000, 'gold_spent'
  )::INTEGER;
  v_gold_balance := public.progression_integer(
    p_result -> 'gold_balance', 0, 0, 1000000, 'gold_balance'
  )::INTEGER;

  IF v_gold_earned - v_gold_spent <> v_gold_balance
    OR (p_result -> 'ledger' -> 'gold' ->> 'earned')::INTEGER <> v_gold_earned
    OR (p_result -> 'ledger' -> 'gold' ->> 'spent')::INTEGER <> v_gold_spent THEN
    RAISE EXCEPTION 'invalid_verified_gold_ledger' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_result -> 'ledger' -> 'items')
      WITH ORDINALITY AS item(value, ordinality)
    WHERE JSONB_TYPEOF(value) <> 'object'
      OR (value ->> 'sequence')::INTEGER <> ordinality
      OR value ->> 'action' NOT IN (
        'found', 'bought', 'sold', 'equipped', 'unequipped', 'consumed'
      )
      OR value ->> 'source' NOT IN (
        'combat', 'shop', 'event', 'treasure', 'rest', 'recruit', 'inventory', 'legacy'
      )
      OR COALESCE(value ->> 'item_id', '') = ''
      OR COALESCE(value ->> 'instance_id', '') = ''
      OR (value ->> 'gold_amount')::INTEGER < 0
      OR (value ->> 'wave')::INTEGER < 1
  ) OR (p_result -> 'ledger' ->> 'next_item_event_sequence')::INTEGER
    <> JSONB_ARRAY_LENGTH(p_result -> 'ledger' -> 'items') + 1 THEN
    RAISE EXCEPTION 'invalid_verified_item_ledger' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_items_bought
  FROM JSONB_ARRAY_ELEMENTS(p_result -> 'ledger' -> 'items') AS item(value)
  WHERE item.value ->> 'action' = 'bought';

  FOR v_member IN
    SELECT value
    FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
  LOOP
    v_champion_id := v_member ->> 'champion_id';
    v_ledger_member := p_result -> 'ledger' -> 'champions' -> v_champion_id;
    IF COALESCE(v_champion_id, '') = ''
      OR JSONB_TYPEOF(v_ledger_member) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid_verified_champion_ledger' USING ERRCODE = '22023';
    END IF;

    v_kills := public.progression_integer(
      v_member -> 'kills', 0, 0, 1000000, 'kills'
    )::INTEGER;
    v_assists := public.progression_integer(
      v_member -> 'assists', 0, 0, 1000000, 'assists'
    )::INTEGER;
    v_damage := public.progression_integer(
      v_member -> 'damage_dealt', 0, 0, 1000000000000, 'damage_dealt'
    );
    v_damage_to_shields := public.progression_integer(
      v_member -> 'damage_to_shields', 0, 0, 1000000000000, 'damage_to_shields'
    );
    v_damage_received := public.progression_integer(
      v_member -> 'damage_received', 0, 0, 1000000000000, 'damage_received'
    );
    v_healing_done := public.progression_integer(
      v_member -> 'healing_done', 0, 0, 1000000000000, 'healing_done'
    );
    v_healing_received := public.progression_integer(
      v_member -> 'healing_received', 0, 0, 1000000000000, 'healing_received'
    );
    v_overhealing := public.progression_integer(
      v_member -> 'overhealing', 0, 0, 1000000000000, 'overhealing'
    );
    v_shielding_done := public.progression_integer(
      v_member -> 'shielding_done', 0, 0, 1000000000000, 'shielding_done'
    );
    v_shielding_absorbed := public.progression_integer(
      v_member -> 'shielding_absorbed', 0, 0, 1000000000000, 'shielding_absorbed'
    );
    v_deaths := public.progression_integer(
      v_member -> 'deaths', 0, 0, 1000000, 'deaths'
    )::INTEGER;

    IF (v_ledger_member ->> 'kills')::INTEGER <> v_kills
      OR (v_ledger_member ->> 'assists')::INTEGER <> v_assists
      OR (v_ledger_member ->> 'damage_dealt')::BIGINT <> v_damage
      OR (v_ledger_member ->> 'damage_to_shields')::BIGINT <> v_damage_to_shields
      OR (v_ledger_member ->> 'damage_received')::BIGINT <> v_damage_received
      OR (v_ledger_member ->> 'healing_done')::BIGINT <> v_healing_done
      OR (v_ledger_member ->> 'healing_received')::BIGINT <> v_healing_received
      OR (v_ledger_member ->> 'overhealing')::BIGINT <> v_overhealing
      OR (v_ledger_member ->> 'shielding_done')::BIGINT <> v_shielding_done
      OR (v_ledger_member ->> 'shielding_absorbed')::BIGINT <> v_shielding_absorbed
      OR (v_ledger_member ->> 'deaths')::INTEGER <> v_deaths THEN
      RAISE EXCEPTION 'verified_champion_ledger_mismatch:%', v_champion_id
        USING ERRCODE = '22023';
    END IF;

    v_total_kills := v_total_kills + v_kills;
    v_total_assists := v_total_assists + v_assists;
    v_total_damage := v_total_damage + v_damage;
    v_total_damage_to_shields := v_total_damage_to_shields + v_damage_to_shields;
    v_total_damage_received := v_total_damage_received + v_damage_received;
    v_total_healing_done := v_total_healing_done + v_healing_done;
    v_total_healing_received := v_total_healing_received + v_healing_received;
    v_total_overhealing := v_total_overhealing + v_overhealing;
    v_total_shielding_done := v_total_shielding_done + v_shielding_done;
    v_total_shielding_absorbed := v_total_shielding_absorbed + v_shielding_absorbed;
  END LOOP;

  IF (
    SELECT COUNT(*)
    FROM JSONB_OBJECT_KEYS(p_result -> 'ledger' -> 'champions')
  ) <> JSONB_ARRAY_LENGTH(p_result -> 'team_members') THEN
    RAISE EXCEPTION 'invalid_verified_ledger_team' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    JSONB_AGG(
      value
        - 'assists'
        - 'damage_to_shields'
        - 'damage_received'
        - 'healing_done'
        - 'healing_received'
        - 'overhealing'
        - 'shielding_done'
        - 'shielding_absorbed'
        - 'deaths'
      ORDER BY ordinality
    ),
    '[]'::JSONB
  )
  INTO v_legacy_members
  FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
    WITH ORDINALITY AS member(value, ordinality);

  v_legacy_result :=
    (p_result - 'gold_spent' - 'gold_balance' - 'ledger')
    || JSONB_BUILD_OBJECT('team_members', v_legacy_members);
  IF NOT v_won AND v_run_level > 1 THEN
    v_legacy_result := JSONB_SET(
      v_legacy_result,
      '{run_level}',
      '1'::JSONB,
      FALSE
    );
  END IF;

  v_response := public.complete_run_verification_v6(
    p_attempt_id,
    p_lease_token,
    v_legacy_result,
    p_result_hash
  );
  IF v_response ->> 'status' IS DISTINCT FROM 'verified' THEN
    RETURN v_response;
  END IF;

  v_run_id := (v_response ->> 'run_id')::UUID;

  UPDATE public.runs
  SET
    run_level = v_run_level,
    gold_earned = v_gold_earned,
    total_gold_spent = v_gold_spent,
    gold_balance = v_gold_balance,
    items_purchased = v_items_bought,
    total_kills = v_total_kills,
    total_assists = v_total_assists,
    total_damage_dealt = v_total_damage,
    total_damage_to_shields = v_total_damage_to_shields,
    total_damage_received = v_total_damage_received,
    total_healing_done = v_total_healing_done,
    total_healing_received = v_total_healing_received,
    total_overhealing = v_total_overhealing,
    total_shielding_done = v_total_shielding_done,
    total_shielding_absorbed = v_total_shielding_absorbed,
    ledger_version = 1,
    run_ledger = p_result -> 'ledger',
    progression_payload_hash = v_result_hash
  WHERE id = v_run_id
    AND run_attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_member IN
    SELECT value
    FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
  LOOP
    UPDATE public.run_team_members
    SET
      kills = (v_member ->> 'kills')::INTEGER,
      assists = (v_member ->> 'assists')::INTEGER,
      damage_dealt = (v_member ->> 'damage_dealt')::BIGINT,
      damage_to_shields = (v_member ->> 'damage_to_shields')::BIGINT,
      damage_received = (v_member ->> 'damage_received')::BIGINT,
      healing_done = (v_member ->> 'healing_done')::BIGINT,
      healing_received = (v_member ->> 'healing_received')::BIGINT,
      overhealing = (v_member ->> 'overhealing')::BIGINT,
      shielding_done = (v_member ->> 'shielding_done')::BIGINT,
      shielding_absorbed = (v_member ->> 'shielding_absorbed')::BIGINT,
      deaths = (v_member ->> 'deaths')::INTEGER
    WHERE run_id = v_run_id
      AND champion_id = v_member ->> 'champion_id';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'verified_run_member_not_found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.champion_mastery
    SET
      total_assists = total_assists + (v_member ->> 'assists')::INTEGER,
      total_damage_received =
        total_damage_received + (v_member ->> 'damage_received')::BIGINT,
      total_healing_done =
        total_healing_done + (v_member ->> 'healing_done')::BIGINT,
      total_shielding_done =
        total_shielding_done + (v_member ->> 'shielding_done')::BIGINT
    WHERE player_id = v_attempt.player_id
      AND champion_id = v_member ->> 'champion_id';
  END LOOP;

  UPDATE public.daily_runs AS daily
  SET
    run_level_reached = v_run_level,
    score = (
      CASE WHEN run.won THEN ruleset.victory_bonus ELSE 0 END
      + run.waves_completed::BIGINT * ruleset.wave_points
      + CARDINALITY(run.biomes_visited)::BIGINT * ruleset.biome_points
      + v_run_level::BIGINT * ruleset.run_level_points
      + v_gold_earned::BIGINT * ruleset.gold_points
    )::INTEGER
  FROM public.runs AS run,
    public.daily_challenge_rulesets AS ruleset
  WHERE daily.run_id = v_run_id
    AND run.id = v_run_id
    AND ruleset.version = daily.daily_ruleset_version;

  SELECT JSONB_BUILD_OBJECT(
    'won', v_won,
    'waves_completed', (p_result ->> 'waves_completed')::INTEGER,
    'biomes_visited', p_result -> 'biomes_visited',
    'gold_earned', v_gold_earned,
    'gold_spent', v_gold_spent,
    'gold_balance', v_gold_balance,
    'run_level', v_run_level,
    'total_kills', v_total_kills,
    'total_damage', v_total_damage,
    'item_events', p_result -> 'ledger' -> 'items',
    'champion_stats', COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'champion_id', member.value ->> 'champion_id',
          'kills', (member.value ->> 'kills')::INTEGER,
          'assists', (member.value ->> 'assists')::INTEGER,
          'total_damage', (member.value ->> 'damage_dealt')::BIGINT,
          'damage_to_shields', (member.value ->> 'damage_to_shields')::BIGINT,
          'damage_received', (member.value ->> 'damage_received')::BIGINT,
          'healing_done', (member.value ->> 'healing_done')::BIGINT,
          'healing_received', (member.value ->> 'healing_received')::BIGINT,
          'overhealing', (member.value ->> 'overhealing')::BIGINT,
          'shielding_done', (member.value ->> 'shielding_done')::BIGINT,
          'shielding_absorbed', (member.value ->> 'shielding_absorbed')::BIGINT,
          'deaths', (member.value ->> 'deaths')::INTEGER,
          'items_collected', member.value -> 'items_collected',
          'survived', (member.value ->> 'final_hp')::INTEGER > 0
        )
        ORDER BY member.value ->> 'champion_id'
      ),
      '[]'::JSONB
    )
  )
  INTO v_summary
  FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members') AS member(value);

  v_response := JSONB_SET(v_response, '{summary}', v_summary, FALSE);
  v_response := JSONB_SET(v_response, '{result_hash}', TO_JSONB(v_result_hash), FALSE);

  UPDATE public.run_attempts
  SET
    result = p_result,
    result_hash = v_result_hash,
    response = v_response
  WHERE id = p_attempt_id
    AND result_run_id = v_run_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
