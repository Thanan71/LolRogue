-- Make the daily leaderboard a projection of verified server-replayed runs.
--
-- The browser may read the current UTC challenge and choose one of its offered
-- starters, but it cannot choose the date, seed, difficulty, score version or
-- score inputs. One official attempt is allowed per account and UTC day.

BEGIN;

-- ---------------------------------------------------------------------------
-- Versioned daily contract
-- ---------------------------------------------------------------------------

CREATE TABLE public.daily_challenge_rulesets (
  version SMALLINT PRIMARY KEY CHECK (version > 0),
  code TEXT NOT NULL UNIQUE,
  gameplay_ruleset_version SMALLINT NOT NULL
    REFERENCES public.gameplay_rulesets(version) ON DELETE RESTRICT,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  seed_namespace TEXT NOT NULL CHECK (
    seed_namespace ~ '^[a-z0-9][a-z0-9_.:-]{2,100}$'
  ),
  score_version SMALLINT NOT NULL UNIQUE CHECK (score_version > 0),
  wave_points INTEGER NOT NULL CHECK (wave_points >= 0),
  biome_points INTEGER NOT NULL CHECK (biome_points >= 0),
  run_level_points INTEGER NOT NULL CHECK (run_level_points >= 0),
  gold_points INTEGER NOT NULL CHECK (gold_points >= 0),
  victory_bonus INTEGER NOT NULL CHECK (victory_bonus >= 0),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX daily_challenge_rulesets_one_active
  ON public.daily_challenge_rulesets ((is_active))
  WHERE is_active;

INSERT INTO public.daily_challenge_rulesets (
  version,
  code,
  gameplay_ruleset_version,
  difficulty,
  seed_namespace,
  score_version,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  is_active
)
VALUES (
  1,
  '2026-07-authoritative-daily-v1',
  1,
  'normal',
  'lolrogue.daily.v1',
  1,
  1000,
  250,
  100,
  1,
  10000,
  TRUE
);

ALTER TABLE public.daily_challenge_rulesets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_challenge_rulesets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.daily_challenge_rulesets TO service_role;

CREATE FUNCTION public.daily_utc_date(p_instant TIMESTAMPTZ)
RETURNS DATE
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT (p_instant AT TIME ZONE 'UTC')::DATE
$$;

CREATE FUNCTION public.daily_utc_expiration(p_daily_date DATE)
RETURNS TIMESTAMPTZ
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT ((p_daily_date + 1)::TIMESTAMP AT TIME ZONE 'UTC')
$$;

CREATE FUNCTION public.daily_seed_for_date(
  p_daily_date DATE,
  p_seed_namespace TEXT
)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT (
    (
      ('x' || SUBSTRING(
        ENCODE(
          extensions.digest(
            CONVERT_TO(p_seed_namespace || ':' || p_daily_date::TEXT, 'UTF8'),
            'sha256'::TEXT
          ),
          'hex'
        ),
        1,
        8
      ))::BIT(32)::BIGINT
      & 2147483646::BIGINT
    ) + 1
  )::INTEGER
$$;

CREATE FUNCTION public.daily_starter_ids(
  p_daily_date DATE,
  p_ruleset_version SMALLINT
)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY_AGG(choice.content_id ORDER BY choice.sort_key, choice.content_id),
    ARRAY[]::TEXT[]
  )
  FROM (
    SELECT
      content.content_id,
      ENCODE(
        extensions.digest(
          CONVERT_TO(
            ruleset.seed_namespace
              || ':' || p_daily_date::TEXT
              || ':' || content.content_id,
            'UTF8'
          ),
          'sha256'::TEXT
        ),
        'hex'
      ) AS sort_key
    FROM public.daily_challenge_rulesets AS ruleset
    JOIN public.gameplay_content_catalog AS content
      ON content.gameplay_ruleset_version = ruleset.gameplay_ruleset_version
      AND content.content_type = 'champion'
      AND content.active
    WHERE ruleset.version = p_ruleset_version
    ORDER BY sort_key, content.content_id
    LIMIT 6
  ) AS choice
$$;

REVOKE ALL ON FUNCTION public.daily_utc_date(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.daily_utc_expiration(DATE)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.daily_seed_for_date(DATE, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.daily_starter_ids(DATE, SMALLINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.daily_utc_date(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_utc_expiration(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_seed_for_date(DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_starter_ids(DATE, SMALLINT) TO service_role;

-- ---------------------------------------------------------------------------
-- Bind official daily attempts to the UTC challenge
-- ---------------------------------------------------------------------------

ALTER TABLE public.run_attempts
  ADD COLUMN daily_date DATE,
  ADD COLUMN daily_ruleset_version SMALLINT,
  ADD COLUMN daily_score_version SMALLINT,
  ADD COLUMN daily_official BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.run_attempts
SET
  daily_date = public.daily_utc_date(started_at),
  daily_ruleset_version = 1,
  daily_score_version = 1
WHERE mode = 'daily';

ALTER TABLE public.run_attempts
  ADD CONSTRAINT run_attempts_daily_ruleset_fk
    FOREIGN KEY (daily_ruleset_version)
    REFERENCES public.daily_challenge_rulesets(version)
    ON DELETE RESTRICT,
  ADD CONSTRAINT run_attempts_daily_contract
    CHECK (
      (
        mode = 'normal'
        AND daily_date IS NULL
        AND daily_ruleset_version IS NULL
        AND daily_score_version IS NULL
        AND NOT daily_official
      )
      OR
      (
        mode = 'daily'
        AND daily_date IS NOT NULL
        AND daily_ruleset_version IS NOT NULL
        AND daily_score_version IS NOT NULL
      )
    );

CREATE UNIQUE INDEX run_attempts_one_official_daily
  ON public.run_attempts (user_id, daily_date)
  WHERE daily_official;

CREATE FUNCTION public.enforce_authoritative_daily_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ruleset public.daily_challenge_rulesets%ROWTYPE;
  v_daily_date DATE;
  v_starter_ids TEXT[];
BEGIN
  IF NEW.mode <> 'daily' THEN
    NEW.daily_date := NULL;
    NEW.daily_ruleset_version := NULL;
    NEW.daily_score_version := NULL;
    NEW.daily_official := FALSE;
    RETURN NEW;
  END IF;

  SELECT * INTO v_ruleset
  FROM public.daily_challenge_rulesets
  WHERE is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_daily_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NEW.gameplay_ruleset_version <> v_ruleset.gameplay_ruleset_version THEN
    RAISE EXCEPTION 'daily_gameplay_ruleset_mismatch' USING ERRCODE = '55000';
  END IF;

  v_daily_date := public.daily_utc_date(CLOCK_TIMESTAMP());
  v_starter_ids := public.daily_starter_ids(v_daily_date, v_ruleset.version);
  IF CARDINALITY(NEW.initial_team) <> 1
    OR NEW.initial_team[1] <> ALL(v_starter_ids) THEN
    RAISE EXCEPTION 'daily_starter_not_offered' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.run_attempts AS existing
    WHERE existing.user_id = NEW.user_id
      AND existing.daily_date = v_daily_date
      AND existing.daily_official
  ) THEN
    RAISE EXCEPTION 'daily_attempt_already_used' USING ERRCODE = '23505';
  END IF;

  NEW.daily_date := v_daily_date;
  NEW.daily_ruleset_version := v_ruleset.version;
  NEW.daily_score_version := v_ruleset.score_version;
  NEW.daily_official := TRUE;
  NEW.difficulty := v_ruleset.difficulty;
  NEW.seed := public.daily_seed_for_date(v_daily_date, v_ruleset.seed_namespace);
  NEW.enhancement_snapshot := '{}'::JSONB;
  NEW.expires_at := LEAST(
    NEW.expires_at,
    public.daily_utc_expiration(v_daily_date)
  );

  -- Re-anchor idempotency and the immutable journal to the canonical daily
  -- facts after removing all caller- or account-dependent gameplay values.
  NEW.start_payload_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'team', TO_JSONB(NEW.initial_team),
          'rune_ids', TO_JSONB(NEW.rune_ids),
          'difficulty', NEW.difficulty,
          'mode', NEW.mode
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );
  NEW.journal_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'attempt_id', NEW.id,
          'ruleset_version', NEW.ruleset_version,
          'gameplay_ruleset_version', NEW.gameplay_ruleset_version,
          'engine_version', NEW.engine_version,
          'seed', NEW.seed,
          'mode', NEW.mode,
          'difficulty', NEW.difficulty,
          'initial_team', TO_JSONB(NEW.initial_team),
          'rune_ids', TO_JSONB(NEW.rune_ids),
          'enhancement_snapshot', NEW.enhancement_snapshot
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_authoritative_daily_attempt()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER run_attempts_authoritative_daily
  BEFORE INSERT OR UPDATE OF
    mode,
    daily_date,
    daily_ruleset_version,
    daily_score_version,
    daily_official,
    difficulty,
    seed,
    initial_team,
    enhancement_snapshot
  ON public.run_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_authoritative_daily_attempt();

CREATE FUNCTION public.start_daily_run_attempt(
  p_command_id UUID,
  p_team TEXT[],
  p_rune_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_ruleset public.daily_challenge_rulesets%ROWTYPE;
  v_started JSONB;
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_ruleset
  FROM public.daily_challenge_rulesets
  WHERE is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_daily_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_started := public.start_run_attempt(
    p_command_id,
    p_team,
    p_rune_ids,
    v_ruleset.difficulty,
    'daily'
  );

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = (v_started ->> 'attempt_id')::UUID
    AND user_id = v_user_id;
  IF NOT FOUND OR NOT v_attempt.daily_official THEN
    RAISE EXCEPTION 'official_daily_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt.id,
    'run_uuid', v_attempt.run_uuid,
    'status', v_attempt.status,
    'ruleset_version', v_attempt.ruleset_version,
    'gameplay_ruleset_version', v_attempt.gameplay_ruleset_version,
    'engine_version', v_attempt.engine_version,
    'command_schema_version', v_attempt.command_schema_version,
    'gameplay_content_hash', v_attempt.gameplay_content_hash,
    'seed', v_attempt.seed,
    'mode', v_attempt.mode,
    'difficulty', v_attempt.difficulty,
    'initial_team', TO_JSONB(v_attempt.initial_team),
    'rune_ids', TO_JSONB(v_attempt.rune_ids),
    'enhancement_snapshot', v_attempt.enhancement_snapshot,
    'daily_date', v_attempt.daily_date,
    'daily_ruleset_version', v_attempt.daily_ruleset_version,
    'daily_score_version', v_attempt.daily_score_version,
    'started_at', v_attempt.started_at,
    'expires_at', v_attempt.expires_at,
    'last_sequence', v_attempt.last_sequence,
    'journal_hash', v_attempt.journal_hash,
    'replayed', COALESCE((v_started ->> 'replayed')::BOOLEAN, FALSE)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[])
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Publish scores only from the atomic verified-run transaction
-- ---------------------------------------------------------------------------

ALTER TABLE public.daily_runs
  ADD COLUMN run_attempt_id UUID
    REFERENCES public.run_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN run_id UUID
    REFERENCES public.runs(id) ON DELETE RESTRICT,
  ADD COLUMN daily_ruleset_version SMALLINT
    REFERENCES public.daily_challenge_rulesets(version) ON DELETE RESTRICT,
  ADD COLUMN score_version SMALLINT,
  ADD COLUMN gameplay_ruleset_version SMALLINT
    REFERENCES public.gameplay_rulesets(version) ON DELETE RESTRICT;

ALTER TABLE public.daily_runs
  DROP CONSTRAINT daily_runs_player_id_daily_date_key,
  ADD CONSTRAINT daily_runs_verified_contract
    CHECK (
      (
        run_attempt_id IS NULL
        AND run_id IS NULL
        AND daily_ruleset_version IS NULL
        AND score_version IS NULL
        AND gameplay_ruleset_version IS NULL
      )
      OR
      (
        run_attempt_id IS NOT NULL
        AND run_id IS NOT NULL
        AND daily_ruleset_version IS NOT NULL
        AND score_version IS NOT NULL
        AND gameplay_ruleset_version IS NOT NULL
      )
    );

CREATE UNIQUE INDEX daily_runs_verified_player_date
  ON public.daily_runs (player_id, daily_date)
  WHERE run_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX daily_runs_verified_attempt
  ON public.daily_runs (run_attempt_id)
  WHERE run_attempt_id IS NOT NULL;

CREATE UNIQUE INDEX daily_runs_verified_run
  ON public.daily_runs (run_id)
  WHERE run_id IS NOT NULL;

CREATE FUNCTION public.record_verified_daily_run()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.run_attempts%ROWTYPE;
  v_ruleset public.daily_challenge_rulesets%ROWTYPE;
  v_last_command_kind TEXT;
  v_score BIGINT;
BEGIN
  IF NEW.progression_source <> 'verified' OR NEW.run_attempt_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = NEW.run_attempt_id
    AND mode = 'daily'
    AND daily_official;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_ruleset
  FROM public.daily_challenge_rulesets
  WHERE version = v_attempt.daily_ruleset_version;
  IF NOT FOUND
    OR v_ruleset.score_version <> v_attempt.daily_score_version
    OR v_ruleset.gameplay_ruleset_version <> v_attempt.gameplay_ruleset_version
    OR v_ruleset.difficulty <> v_attempt.difficulty
    OR NEW.seed <> v_attempt.seed THEN
    RAISE EXCEPTION 'daily_verified_contract_mismatch' USING ERRCODE = '55000';
  END IF;

  SELECT command.kind INTO v_last_command_kind
  FROM public.run_attempt_commands AS command
  WHERE command.attempt_id = v_attempt.id
    AND command.sequence = v_attempt.sealed_sequence;

  -- The one official attempt is consumed, but voluntary abandonment is not a
  -- competitive result and therefore never appears on the public board.
  IF v_last_command_kind = 'abandon_run' THEN
    RETURN NEW;
  END IF;

  v_score :=
    CASE WHEN NEW.won THEN v_ruleset.victory_bonus ELSE 0 END
    + NEW.waves_completed::BIGINT * v_ruleset.wave_points
    + CARDINALITY(NEW.biomes_visited)::BIGINT * v_ruleset.biome_points
    + NEW.run_level::BIGINT * v_ruleset.run_level_points
    + NEW.gold_earned::BIGINT * v_ruleset.gold_points;

  IF v_score < 0 OR v_score > 2147483647 THEN
    RAISE EXCEPTION 'daily_score_out_of_range' USING ERRCODE = '22003';
  END IF;

  INSERT INTO public.daily_runs (
    player_id,
    daily_date,
    daily_seed,
    score,
    won,
    run_level_reached,
    waves_completed,
    completed_at,
    run_attempt_id,
    run_id,
    daily_ruleset_version,
    score_version,
    gameplay_ruleset_version
  )
  VALUES (
    NEW.player_id,
    v_attempt.daily_date,
    v_attempt.seed,
    v_score::INTEGER,
    NEW.won,
    NEW.run_level,
    NEW.waves_completed,
    NEW.completed_at,
    v_attempt.id,
    NEW.id,
    v_ruleset.version,
    v_ruleset.score_version,
    v_ruleset.gameplay_ruleset_version
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_verified_daily_run()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER runs_record_verified_daily
  AFTER INSERT ON public.runs
  FOR EACH ROW
  EXECUTE FUNCTION public.record_verified_daily_run();

-- The old metric submission remains in migration history, but no role can use
-- it after this cutoff. Direct table access is also removed.
REVOKE ALL ON FUNCTION public.submit_daily_run(
  DATE, BIGINT, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.submit_daily_run(
  DATE, BIGINT, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER
);

DROP POLICY IF EXISTS "Daily runs read" ON public.daily_runs;
REVOKE ALL ON TABLE public.daily_runs
  FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY "Daily runs admin read"
  ON public.daily_runs FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
GRANT SELECT ON TABLE public.daily_runs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.daily_runs TO service_role;

CREATE VIEW public.daily_leaderboard
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  ranked.daily_date,
  ranked.rank,
  ranked.player_name,
  ranked.score,
  ranked.won,
  ranked.run_level_reached,
  ranked.waves_completed,
  ranked.score_version
FROM (
  SELECT
    daily.daily_date,
    ROW_NUMBER() OVER (
      PARTITION BY daily.daily_date
      ORDER BY
        daily.score DESC,
        daily.waves_completed DESC,
        daily.completed_at ASC,
        daily.id ASC
    )::INTEGER AS rank,
    COALESCE(NULLIF(player.display_name, ''), player.username) AS player_name,
    daily.score,
    daily.won,
    daily.run_level_reached,
    daily.waves_completed,
    daily.score_version
  FROM public.daily_runs AS daily
  JOIN public.players AS player
    ON player.id = daily.player_id
  WHERE daily.run_attempt_id IS NOT NULL
    AND daily.completed_at IS NOT NULL
) AS ranked;

REVOKE ALL ON TABLE public.daily_leaderboard
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.daily_leaderboard TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Single UTC challenge/status source for clients
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.get_daily_challenge()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_ruleset public.daily_challenge_rulesets%ROWTYPE;
  v_gameplay public.gameplay_rulesets%ROWTYPE;
  v_attempt public.run_attempts%ROWTYPE;
  v_daily public.daily_runs%ROWTYPE;
  v_now TIMESTAMPTZ := CLOCK_TIMESTAMP();
  v_daily_date DATE;
BEGIN
  SELECT * INTO v_ruleset
  FROM public.daily_challenge_rulesets
  WHERE is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_daily_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_gameplay
  FROM public.gameplay_rulesets
  WHERE version = v_ruleset.gameplay_ruleset_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily_gameplay_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_daily_date := public.daily_utc_date(v_now);

  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_attempt
    FROM public.run_attempts
    WHERE user_id = v_user_id
      AND daily_date = v_daily_date
      AND daily_official;

    IF FOUND THEN
      SELECT * INTO v_daily
      FROM public.daily_runs
      WHERE run_attempt_id = v_attempt.id;
    END IF;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'daily_date', v_daily_date,
    'seed', public.daily_seed_for_date(v_daily_date, v_ruleset.seed_namespace),
    'starts_at', (v_daily_date::TIMESTAMP AT TIME ZONE 'UTC'),
    'expires_at', public.daily_utc_expiration(v_daily_date),
    'difficulty', v_ruleset.difficulty,
    'daily_ruleset_version', v_ruleset.version,
    'gameplay_ruleset_version', v_ruleset.gameplay_ruleset_version,
    'engine_version', v_gameplay.engine_version,
    'gameplay_content_hash', v_gameplay.content_hash,
    'score_version', v_ruleset.score_version,
    'starter_ids', TO_JSONB(public.daily_starter_ids(v_daily_date, v_ruleset.version)),
    'attempt_policy', 'one_official_attempt_per_utc_day',
    'has_attempted', v_attempt.id IS NOT NULL,
    'attempt_id', v_attempt.id,
    'attempt_status', v_attempt.status,
    'published', v_daily.id IS NOT NULL,
    'score', v_daily.score
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_challenge()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge()
  TO anon, authenticated, service_role;

COMMIT;
