-- Final authority boundary for gameplay progression.
--
-- Authenticated clients may create one server-seeded attempt, append immutable
-- semantic commands and seal the journal. Only the trusted verifier may claim
-- the sealed journal and atomically persist a verified run plus its progression.

BEGIN;

-- ---------------------------------------------------------------------------
-- Versioned gameplay runtime and historical security decision
-- ---------------------------------------------------------------------------

CREATE TABLE public.gameplay_rulesets (
  version SMALLINT PRIMARY KEY CHECK (version > 0),
  code TEXT NOT NULL UNIQUE,
  engine_version TEXT NOT NULL CHECK (engine_version ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
  command_schema_version SMALLINT NOT NULL CHECK (command_schema_version > 0),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_ttl INTERVAL NOT NULL DEFAULT INTERVAL '24 hours'
    CHECK (attempt_ttl BETWEEN INTERVAL '15 minutes' AND INTERVAL '7 days'),
  max_commands INTEGER NOT NULL DEFAULT 4096 CHECK (max_commands BETWEEN 1 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX gameplay_rulesets_one_active
  ON public.gameplay_rulesets ((is_active))
  WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version,
  code,
  engine_version,
  command_schema_version,
  content_hash,
  is_active
)
VALUES (
  1,
  '2026-07-verified-gameplay-v1',
  'run-engine-v1',
  1,
  'cbb1a53ea9f9231e542181de9e387ebef1d00415e2765c081db8c4ebd9c42465',
  TRUE
);

CREATE TABLE public.gameplay_content_catalog (
  gameplay_ruleset_version SMALLINT NOT NULL
    REFERENCES public.gameplay_rulesets(version) ON DELETE RESTRICT,
  content_type TEXT NOT NULL CHECK (content_type IN ('champion', 'rune', 'augment')),
  content_id TEXT NOT NULL CHECK (content_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (gameplay_ruleset_version, content_type, content_id)
);

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version,
  content_type,
  content_id
)
VALUES
  (1, 'champion', 'Garen'),
  (1, 'champion', 'Annie'),
  (1, 'champion', 'Ashe'),
  (1, 'champion', 'Darius'),
  (1, 'champion', 'Lux'),
  (1, 'champion', 'Soraka'),
  (1, 'champion', 'Jinx'),
  (1, 'champion', 'Leona'),
  (1, 'champion', 'Malphite'),
  (1, 'champion', 'Warwick'),
  (1, 'rune', 'press_the_attack'),
  (1, 'rune', 'triumph'),
  (1, 'rune', 'legend_alacrity'),
  (1, 'rune', 'last_stand'),
  (1, 'rune', 'electrocute'),
  (1, 'rune', 'sudden_impact'),
  (1, 'rune', 'eyeball_collection'),
  (1, 'rune', 'ravenous_hunter'),
  (1, 'rune', 'summon_aery'),
  (1, 'rune', 'manaflow_band'),
  (1, 'rune', 'transcendence'),
  (1, 'rune', 'scorch'),
  (1, 'rune', 'grasp_of_the_undying'),
  (1, 'rune', 'conditioning'),
  (1, 'rune', 'overgrowth'),
  (1, 'rune', 'revitalize'),
  (1, 'rune', 'glacial_augment'),
  (1, 'rune', 'hextech_flash'),
  (1, 'rune', 'cosmic_insight'),
  (1, 'rune', 'time_warp_tonic'),
  (1, 'augment', 'brute_force'),
  (1, 'augment', 'iron_skin'),
  (1, 'augment', 'arcane_mind'),
  (1, 'augment', 'vitality_boost'),
  (1, 'augment', 'swift_feet'),
  (1, 'augment', 'critical_focus'),
  (1, 'augment', 'golden_touch'),
  (1, 'augment', 'field_medic'),
  (1, 'augment', 'warlord'),
  (1, 'augment', 'bulwark'),
  (1, 'augment', 'sorcery_supreme'),
  (1, 'augment', 'glass_cannon'),
  (1, 'augment', 'fortune'),
  (1, 'augment', 'battle_hardened'),
  (1, 'augment', 'divine_blessing'),
  (1, 'augment', 'phoenix_heart'),
  (1, 'augment', 'hyper_carry'),
  (1, 'augment', 'unstoppable'),
  (1, 'augment', 'golden_age');

CREATE TABLE public.progression_security_baselines (
  baseline_code TEXT PRIMARY KEY,
  cutoff_at TIMESTAMPTZ NOT NULL,
  migration_version TEXT NOT NULL UNIQUE,
  policy TEXT NOT NULL CHECK (
    policy IN ('grandfather_legacy_no_retroactive_reset')
  ),
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.progression_security_baselines (
  baseline_code,
  cutoff_at,
  migration_version,
  policy,
  notes
)
VALUES (
  'verified-run-cutoff-v1',
  NOW(),
  '20260724090000_verified_run_attempts',
  'grandfather_legacy_no_retroactive_reset',
  'Existing counters and legacy/client-reported runs remain historical. No retroactive reset is performed; only verified attempts may add run progression after this cutoff.'
);

-- ---------------------------------------------------------------------------
-- Server-owned attempt and immutable command journal
-- ---------------------------------------------------------------------------

CREATE TABLE public.run_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  start_command_id UUID NOT NULL,
  start_payload_hash TEXT NOT NULL CHECK (start_payload_hash ~ '^[0-9a-f]{64}$'),
  run_uuid TEXT NOT NULL UNIQUE CHECK (run_uuid ~ '^attempt_[0-9a-f-]{36}$'),
  status TEXT NOT NULL DEFAULT 'started' CHECK (
    status IN ('started', 'finished', 'verified', 'rejected', 'expired')
  ),
  ruleset_version SMALLINT NOT NULL REFERENCES public.progression_rulesets(version),
  gameplay_ruleset_version SMALLINT NOT NULL REFERENCES public.gameplay_rulesets(version),
  engine_version TEXT NOT NULL,
  command_schema_version SMALLINT NOT NULL CHECK (command_schema_version > 0),
  gameplay_content_hash TEXT NOT NULL CHECK (gameplay_content_hash ~ '^[0-9a-f]{64}$'),
  seed INTEGER NOT NULL CHECK (seed > 0),
  mode TEXT NOT NULL CHECK (mode IN ('normal', 'daily')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  initial_team TEXT[] NOT NULL,
  rune_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  enhancement_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(enhancement_snapshot) = 'object'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  journal_hash TEXT NOT NULL CHECK (journal_hash ~ '^[0-9a-f]{64}$'),
  journal_bytes INTEGER NOT NULL DEFAULT 0 CHECK (journal_bytes >= 0),
  finish_command_id UUID,
  sealed_sequence INTEGER CHECK (sealed_sequence >= 0),
  sealed_journal_hash TEXT CHECK (
    sealed_journal_hash IS NULL OR sealed_journal_hash ~ '^[0-9a-f]{64}$'
  ),
  finished_at TIMESTAMPTZ,
  lease_worker_id UUID,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  verification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (verification_attempts >= 0),
  result_hash TEXT CHECK (result_hash IS NULL OR result_hash ~ '^[0-9a-f]{64}$'),
  result JSONB,
  response JSONB,
  result_run_id UUID UNIQUE REFERENCES public.runs(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  rejection_code TEXT CHECK (
    rejection_code IS NULL OR rejection_code ~ '^[a-z0-9_:-]{1,100}$'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, start_command_id),
  CHECK (CARDINALITY(initial_team) BETWEEN 1 AND 5),
  CHECK (ARRAY_POSITION(initial_team, NULL) IS NULL),
  CHECK (CARDINALITY(rune_ids) <= 3),
  CHECK (ARRAY_POSITION(rune_ids, NULL) IS NULL),
  CHECK (expires_at > started_at),
  CHECK (
    (status = 'started'
      AND finish_command_id IS NULL
      AND finished_at IS NULL
      AND verified_at IS NULL
      AND rejected_at IS NULL
      AND expired_at IS NULL)
    OR
    (status = 'finished'
      AND finish_command_id IS NOT NULL
      AND finished_at IS NOT NULL
      AND sealed_sequence IS NOT NULL
      AND sealed_journal_hash IS NOT NULL
      AND verified_at IS NULL
      AND rejected_at IS NULL
      AND expired_at IS NULL)
    OR
    (status = 'verified'
      AND finish_command_id IS NOT NULL
      AND finished_at IS NOT NULL
      AND result_run_id IS NOT NULL
      AND result_hash IS NOT NULL
      AND result IS NOT NULL
      AND response IS NOT NULL
      AND verified_at IS NOT NULL
      AND rejected_at IS NULL
      AND expired_at IS NULL)
    OR
    (status = 'rejected'
      AND finish_command_id IS NOT NULL
      AND finished_at IS NOT NULL
      AND rejection_code IS NOT NULL
      AND rejected_at IS NOT NULL
      AND verified_at IS NULL
      AND expired_at IS NULL)
    OR
    (status = 'expired'
      AND expired_at IS NOT NULL
      AND verified_at IS NULL
      AND rejected_at IS NULL)
  )
);

CREATE UNIQUE INDEX run_attempts_one_open_per_user
  ON public.run_attempts (user_id)
  WHERE status IN ('started', 'finished');

CREATE INDEX run_attempts_player_started
  ON public.run_attempts (player_id, started_at DESC);

CREATE INDEX run_attempts_finished_queue
  ON public.run_attempts (finished_at)
  WHERE status = 'finished';

CREATE TABLE public.run_attempt_commands (
  attempt_id UUID NOT NULL REFERENCES public.run_attempts(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  command_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_]{0,63}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  previous_hash TEXT NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
  chain_hash TEXT NOT NULL CHECK (chain_hash ~ '^[0-9a-f]{64}$'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, sequence),
  UNIQUE (attempt_id, command_id)
);

ALTER TABLE public.runs
  ADD COLUMN run_attempt_id UUID UNIQUE
    REFERENCES public.run_attempts(id) ON DELETE RESTRICT;

ALTER TABLE public.runs
  ADD CONSTRAINT runs_verified_attempt_required
  CHECK (
    progression_source <> 'verified'
    OR run_attempt_id IS NOT NULL
  );

CREATE TRIGGER run_attempts_set_updated_at
  BEFORE UPDATE ON public.run_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS and least privilege
-- ---------------------------------------------------------------------------

ALTER TABLE public.gameplay_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameplay_content_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_security_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_attempt_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gameplay rulesets read"
  ON public.gameplay_rulesets FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Gameplay content read"
  ON public.gameplay_content_catalog FOR SELECT TO authenticated
  USING (active);

CREATE POLICY "Progression security baselines read"
  ON public.progression_security_baselines FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Run attempts read own"
  ON public.run_attempts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Run attempt commands read own"
  ON public.run_attempt_commands FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.run_attempts AS attempt
      WHERE attempt.id = run_attempt_commands.attempt_id
        AND attempt.user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON TABLE public.gameplay_rulesets
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.gameplay_content_catalog
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.progression_security_baselines
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.run_attempts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.run_attempt_commands
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.gameplay_rulesets TO authenticated;
GRANT SELECT ON TABLE public.gameplay_content_catalog TO authenticated;
GRANT SELECT ON TABLE public.progression_security_baselines TO authenticated;
GRANT SELECT ON TABLE public.run_attempts TO authenticated;
GRANT SELECT ON TABLE public.run_attempt_commands TO authenticated;

-- The previous client-reported completion command is no longer a client
-- progression path. Existing rows remain untouched under the recorded baseline.
REVOKE ALL ON FUNCTION public.save_completed_run_v2(JSONB, JSONB, TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Authenticated attempt lifecycle
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.start_run_attempt(
  p_command_id UUID,
  p_team TEXT[],
  p_rune_ids TEXT[],
  p_difficulty TEXT,
  p_mode TEXT DEFAULT 'normal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_player public.players%ROWTYPE;
  v_ruleset public.progression_rulesets%ROWTYPE;
  v_gameplay public.gameplay_rulesets%ROWTYPE;
  v_existing public.run_attempts%ROWTYPE;
  v_attempt_id UUID;
  v_team TEXT[] := COALESCE(p_team, ARRAY[]::TEXT[]);
  v_runes TEXT[] := COALESCE(p_rune_ids, ARRAY[]::TEXT[]);
  v_difficulty TEXT := BTRIM(COALESCE(p_difficulty, ''));
  v_mode TEXT := BTRIM(COALESCE(p_mode, 'normal'));
  v_start_payload_hash TEXT;
  v_enhancement_snapshot JSONB := '{}'::JSONB;
  v_seed INTEGER;
  v_run_uuid TEXT;
  v_started_at TIMESTAMPTZ := CLOCK_TIMESTAMP();
  v_expires_at TIMESTAMPTZ;
  v_journal_hash TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF p_command_id IS NULL THEN
    RAISE EXCEPTION 'invalid_start_command_id' USING ERRCODE = '22023';
  END IF;
  IF v_difficulty NOT IN ('easy', 'normal', 'hard') THEN
    RAISE EXCEPTION 'invalid_run_difficulty' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('normal', 'daily') THEN
    RAISE EXCEPTION 'invalid_run_mode' USING ERRCODE = '22023';
  END IF;

  v_start_payload_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'team', TO_JSONB(v_team),
          'rune_ids', TO_JSONB(v_runes),
          'difficulty', v_difficulty,
          'mode', v_mode
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );

  -- One player-row lock serializes concurrent starts and progression credits.
  SELECT * INTO v_player
  FROM public.players
  WHERE user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve idempotent retries before consulting active rulesets.
  SELECT * INTO v_existing
  FROM public.run_attempts
  WHERE user_id = v_user_id
    AND start_command_id = p_command_id;

  IF FOUND THEN
    IF v_existing.start_payload_hash <> v_start_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', v_existing.id,
      'run_uuid', v_existing.run_uuid,
      'status', v_existing.status,
      'ruleset_version', v_existing.ruleset_version,
      'gameplay_ruleset_version', v_existing.gameplay_ruleset_version,
      'engine_version', v_existing.engine_version,
      'command_schema_version', v_existing.command_schema_version,
      'gameplay_content_hash', v_existing.gameplay_content_hash,
      'seed', v_existing.seed,
      'mode', v_existing.mode,
      'difficulty', v_existing.difficulty,
      'initial_team', TO_JSONB(v_existing.initial_team),
      'rune_ids', TO_JSONB(v_existing.rune_ids),
      'enhancement_snapshot', v_existing.enhancement_snapshot,
      'started_at', v_existing.started_at,
      'expires_at', v_existing.expires_at,
      'last_sequence', v_existing.last_sequence,
      'journal_hash', v_existing.journal_hash,
      'replayed', TRUE
    );
  END IF;

  -- Expiration is enforced on every mutation; this lazy update also releases
  -- the one-open-attempt constraint without relying on a cron job.
  UPDATE public.run_attempts
  SET status = 'expired', expired_at = CLOCK_TIMESTAMP()
  WHERE user_id = v_user_id
    AND status = 'started'
    AND expires_at <= CLOCK_TIMESTAMP();

  IF EXISTS (
    SELECT 1
    FROM public.run_attempts
    WHERE user_id = v_user_id
      AND status IN ('started', 'finished')
  ) THEN
    RAISE EXCEPTION 'run_attempt_already_open' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_ruleset
  FROM public.progression_rulesets
  WHERE is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_progression_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_gameplay
  FROM public.gameplay_rulesets
  WHERE is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_gameplay_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF CARDINALITY(v_team) < 1 OR CARDINALITY(v_team) > v_ruleset.max_team_size THEN
    RAISE EXCEPTION 'invalid_team_size' USING ERRCODE = '22023';
  END IF;
  IF ARRAY_POSITION(v_team, NULL) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM UNNEST(v_team) AS champion_id
      WHERE champion_id !~ '^[A-Za-z0-9_.:-]{1,100}$'
    )
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT champion_id)
      FROM UNNEST(v_team) AS champion_id
    ) THEN
    RAISE EXCEPTION 'invalid_initial_team' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM UNNEST(v_team) AS requested(champion_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.progression_champion_catalog AS champion
      JOIN public.gameplay_content_catalog AS gameplay_champion
        ON gameplay_champion.gameplay_ruleset_version = v_gameplay.version
        AND gameplay_champion.content_type = 'champion'
        AND gameplay_champion.content_id = champion.champion_id
        AND gameplay_champion.active
      WHERE champion.ruleset_version = v_ruleset.version
        AND champion.champion_id = requested.champion_id
        AND champion.active
    )
  ) THEN
    RAISE EXCEPTION 'unsupported_initial_champion' USING ERRCODE = '22023';
  END IF;

  IF CARDINALITY(v_runes) > 3
    OR ARRAY_POSITION(v_runes, NULL) IS NOT NULL
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT rune_id)
      FROM UNNEST(v_runes) AS rune_id
    )
    OR EXISTS (
      SELECT 1
      FROM UNNEST(v_runes) AS requested(rune_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.gameplay_content_catalog AS rune
        WHERE rune.gameplay_ruleset_version = v_gameplay.version
          AND rune.content_type = 'rune'
          AND rune.content_id = requested.rune_id
          AND rune.active
      )
    ) THEN
    RAISE EXCEPTION 'invalid_rune_loadout' USING ERRCODE = '22023';
  END IF;

  -- Freeze the direct node->rank map for every champion this engine can
  -- recruit, not only the initial team. Later account changes cannot alter
  -- this replay and the Edge contract stays { championId: unlockedNodes }.
  SELECT COALESCE(
    JSONB_OBJECT_AGG(
      champion.content_id,
      COALESCE(enhancement.unlocked_nodes, '{}'::JSONB)
      ORDER BY champion.content_id
    ),
    '{}'::JSONB
  )
  INTO v_enhancement_snapshot
  FROM public.gameplay_content_catalog AS champion
  LEFT JOIN public.champion_enhancements AS enhancement
    ON enhancement.user_id = v_user_id
    AND enhancement.champion_id = champion.content_id
  WHERE champion.gameplay_ruleset_version = v_gameplay.version
    AND champion.content_type = 'champion'
    AND champion.active;

  -- Daily attempts share a UTC date/ruleset seed. Normal attempts get a
  -- cryptographically random UUID-derived positive 31-bit seed.
  IF v_mode = 'daily' THEN
    v_seed := (
      pg_catalog.hashtextextended(
        ((CLOCK_TIMESTAMP() AT TIME ZONE 'UTC')::DATE)::TEXT
          || ':' || v_gameplay.version::TEXT,
        0
      ) & 2147483646::BIGINT
    )::INTEGER + 1;
  ELSE
    v_seed := (
      pg_catalog.hashtextextended(extensions.gen_random_uuid()::TEXT, 0)
        & 2147483646::BIGINT
    )::INTEGER + 1;
  END IF;

  v_attempt_id := extensions.gen_random_uuid();
  v_run_uuid := 'attempt_' || v_attempt_id::TEXT;
  v_expires_at := v_started_at + v_gameplay.attempt_ttl;
  v_journal_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'attempt_id', v_attempt_id,
          'ruleset_version', v_ruleset.version,
          'gameplay_ruleset_version', v_gameplay.version,
          'engine_version', v_gameplay.engine_version,
          'seed', v_seed,
          'mode', v_mode,
          'difficulty', v_difficulty,
          'initial_team', TO_JSONB(v_team),
          'rune_ids', TO_JSONB(v_runes),
          'enhancement_snapshot', v_enhancement_snapshot
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );

  INSERT INTO public.run_attempts (
    id,
    user_id,
    player_id,
    start_command_id,
    start_payload_hash,
    run_uuid,
    ruleset_version,
    gameplay_ruleset_version,
    engine_version,
    command_schema_version,
    gameplay_content_hash,
    seed,
    mode,
    difficulty,
    initial_team,
    rune_ids,
    enhancement_snapshot,
    started_at,
    expires_at,
    journal_hash
  )
  VALUES (
    v_attempt_id,
    v_user_id,
    v_player.id,
    p_command_id,
    v_start_payload_hash,
    v_run_uuid,
    v_ruleset.version,
    v_gameplay.version,
    v_gameplay.engine_version,
    v_gameplay.command_schema_version,
    v_gameplay.content_hash,
    v_seed,
    v_mode,
    v_difficulty,
    v_team,
    v_runes,
    v_enhancement_snapshot,
    v_started_at,
    v_expires_at,
    v_journal_hash
  );

  RETURN JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt_id,
    'run_uuid', v_run_uuid,
    'status', 'started',
    'ruleset_version', v_ruleset.version,
    'gameplay_ruleset_version', v_gameplay.version,
    'engine_version', v_gameplay.engine_version,
    'command_schema_version', v_gameplay.command_schema_version,
    'gameplay_content_hash', v_gameplay.content_hash,
    'seed', v_seed,
    'mode', v_mode,
    'difficulty', v_difficulty,
    'initial_team', TO_JSONB(v_team),
    'rune_ids', TO_JSONB(v_runes),
    'enhancement_snapshot', v_enhancement_snapshot,
    'started_at', v_started_at,
    'expires_at', v_expires_at,
    'last_sequence', 0,
    'journal_hash', v_journal_hash,
    'replayed', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT)
  TO authenticated;

CREATE FUNCTION public.append_run_attempt_commands(
  p_attempt_id UUID,
  p_commands JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_attempt public.run_attempts%ROWTYPE;
  v_gameplay public.gameplay_rulesets%ROWTYPE;
  v_command JSONB;
  v_key TEXT;
  v_command_id UUID;
  v_sequence INTEGER;
  v_previous_input_sequence INTEGER;
  v_kind TEXT;
  v_payload JSONB;
  v_payload_hash TEXT;
  v_chain_hash TEXT;
  v_existing public.run_attempt_commands%ROWTYPE;
  v_inserted_count INTEGER := 0;
  v_command_bytes INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF p_attempt_id IS NULL
    OR p_commands IS NULL
    OR jsonb_typeof(p_commands) <> 'array'
    OR JSONB_ARRAY_LENGTH(p_commands) NOT BETWEEN 1 AND 50
    OR OCTET_LENGTH(p_commands::TEXT) > 262144 THEN
    RAISE EXCEPTION 'invalid_command_batch' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
    AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status = 'started' AND v_attempt.expires_at <= CLOCK_TIMESTAMP() THEN
    UPDATE public.run_attempts
    SET status = 'expired', expired_at = CLOCK_TIMESTAMP()
    WHERE id = v_attempt.id;
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', v_attempt.id,
      'status', 'expired',
      'last_sequence', v_attempt.last_sequence,
      'journal_hash', v_attempt.journal_hash,
      'accepted', 0,
      'replayed', FALSE
    );
  END IF;
  IF v_attempt.status <> 'started' THEN
    RAISE EXCEPTION 'run_attempt_not_started:%', v_attempt.status
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_gameplay
  FROM public.gameplay_rulesets
  WHERE version = v_attempt.gameplay_ruleset_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gameplay_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_command IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_commands)
  LOOP
    IF jsonb_typeof(v_command) <> 'object' THEN
      RAISE EXCEPTION 'invalid_run_command' USING ERRCODE = '22023';
    END IF;
    FOR v_key IN SELECT JSONB_OBJECT_KEYS(v_command)
    LOOP
      IF v_key <> ALL (ARRAY['command_id', 'sequence', 'kind', 'payload']::TEXT[]) THEN
        RAISE EXCEPTION 'unexpected_run_command_field:%', v_key
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(v_command -> 'command_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_command -> 'sequence') IS DISTINCT FROM 'number'
      OR (v_command ->> 'sequence') !~ '^[1-9][0-9]*$'
      OR jsonb_typeof(v_command -> 'kind') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_command -> 'payload') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'invalid_run_command' USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_command_id := (v_command ->> 'command_id')::UUID;
      v_sequence := (v_command ->> 'sequence')::INTEGER;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION 'invalid_run_command_identity' USING ERRCODE = '22023';
    END;
    v_kind := v_command ->> 'kind';
    v_payload := v_command -> 'payload';

    IF v_kind NOT IN (
      'move_node',
      'resolve_combat',
      'shop_buy_item',
      'shop_recruit',
      'rest',
      'recruit',
      'event',
      'treasure',
      'resolve_node',
      'equip_item',
      'unequip_item',
      'sell_item',
      'choose_augment',
      'upgrade_spell',
      'abandon_run'
    ) THEN
      RAISE EXCEPTION 'invalid_run_command_kind' USING ERRCODE = '22023';
    END IF;
    v_command_bytes := OCTET_LENGTH(v_command::TEXT);
    IF v_command_bytes > 8192 THEN
      RAISE EXCEPTION 'run_command_too_large' USING ERRCODE = '22023';
    END IF;
    IF v_previous_input_sequence IS NOT NULL
      AND v_sequence <> v_previous_input_sequence + 1 THEN
      RAISE EXCEPTION 'non_contiguous_command_batch' USING ERRCODE = '22023';
    END IF;
    v_previous_input_sequence := v_sequence;

    v_payload_hash := ENCODE(
      extensions.digest(
        CONVERT_TO(
          JSONB_BUILD_OBJECT(
            'sequence', v_sequence,
            'kind', v_kind,
            'payload', v_payload
          )::TEXT,
          'UTF8'
        ),
        'sha256'::TEXT
      ),
      'hex'
    );

    SELECT * INTO v_existing
    FROM public.run_attempt_commands
    WHERE attempt_id = v_attempt.id
      AND command_id = v_command_id;

    IF FOUND THEN
      IF v_existing.sequence <> v_sequence
        OR v_existing.kind <> v_kind
        OR v_existing.payload_hash <> v_payload_hash THEN
        RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
      END IF;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.run_attempt_commands
      WHERE attempt_id = v_attempt.id
        AND sequence = v_sequence
    ) THEN
      RAISE EXCEPTION 'run_command_sequence_conflict' USING ERRCODE = '22023';
    END IF;
    IF v_sequence <> v_attempt.last_sequence + 1 THEN
      RAISE EXCEPTION 'run_command_sequence_expected:%', v_attempt.last_sequence + 1
        USING ERRCODE = '22023';
    END IF;
    IF v_sequence > v_gameplay.max_commands
      OR v_attempt.journal_bytes + v_command_bytes > 4194304 THEN
      RAISE EXCEPTION 'run_command_limit_exceeded' USING ERRCODE = '54000';
    END IF;

    v_chain_hash := ENCODE(
      extensions.digest(
        CONVERT_TO(
          v_attempt.journal_hash
            || ':' || v_attempt.id::TEXT
            || ':' || v_sequence::TEXT
            || ':' || v_command_id::TEXT
            || ':' || v_payload_hash,
          'UTF8'
        ),
        'sha256'::TEXT
      ),
      'hex'
    );

    INSERT INTO public.run_attempt_commands (
      attempt_id,
      sequence,
      command_id,
      kind,
      payload,
      payload_hash,
      previous_hash,
      chain_hash
    )
    VALUES (
      v_attempt.id,
      v_sequence,
      v_command_id,
      v_kind,
      v_payload,
      v_payload_hash,
      v_attempt.journal_hash,
      v_chain_hash
    );

    v_attempt.last_sequence := v_sequence;
    v_attempt.journal_hash := v_chain_hash;
    v_attempt.journal_bytes := v_attempt.journal_bytes + v_command_bytes;
    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  IF v_inserted_count > 0 THEN
    UPDATE public.run_attempts
    SET
      last_sequence = v_attempt.last_sequence,
      journal_hash = v_attempt.journal_hash,
      journal_bytes = v_attempt.journal_bytes
    WHERE id = v_attempt.id;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt.id,
    'status', 'started',
    'last_sequence', v_attempt.last_sequence,
    'journal_hash', v_attempt.journal_hash,
    'accepted', v_inserted_count,
    'replayed', v_inserted_count = 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_run_attempt_commands(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.append_run_attempt_commands(UUID, JSONB)
  TO authenticated;

CREATE FUNCTION public.seal_run_attempt(
  p_attempt_id UUID,
  p_finish_command_id UUID,
  p_expected_sequence INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF p_attempt_id IS NULL
    OR p_finish_command_id IS NULL
    OR p_expected_sequence IS NULL
    OR p_expected_sequence < 0 THEN
    RAISE EXCEPTION 'invalid_seal_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
    AND user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status <> 'started' THEN
    IF v_attempt.finish_command_id = p_finish_command_id
      AND v_attempt.sealed_sequence = p_expected_sequence THEN
      RETURN JSONB_BUILD_OBJECT(
        'attempt_id', v_attempt.id,
        'run_uuid', v_attempt.run_uuid,
        'status', v_attempt.status,
        'last_sequence', v_attempt.last_sequence,
        'journal_hash', v_attempt.journal_hash,
        'accepted', v_attempt.status <> 'expired',
        'replayed', TRUE
      );
    END IF;
    RAISE EXCEPTION 'run_attempt_already_sealed:%', v_attempt.status
      USING ERRCODE = '55000';
  END IF;

  IF v_attempt.expires_at <= CLOCK_TIMESTAMP() THEN
    UPDATE public.run_attempts
    SET status = 'expired', expired_at = CLOCK_TIMESTAMP()
    WHERE id = v_attempt.id;
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', v_attempt.id,
      'run_uuid', v_attempt.run_uuid,
      'status', 'expired',
      'last_sequence', v_attempt.last_sequence,
      'journal_hash', v_attempt.journal_hash,
      'accepted', FALSE,
      'replayed', FALSE
    );
  END IF;

  IF p_expected_sequence <> v_attempt.last_sequence THEN
    RAISE EXCEPTION 'run_command_sequence_expected:%', v_attempt.last_sequence
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.run_attempts
  SET
    status = 'finished',
    finish_command_id = p_finish_command_id,
    sealed_sequence = last_sequence,
    sealed_journal_hash = journal_hash,
    finished_at = CLOCK_TIMESTAMP()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt.id,
    'run_uuid', v_attempt.run_uuid,
    'status', v_attempt.status,
    'last_sequence', v_attempt.last_sequence,
    'journal_hash', v_attempt.journal_hash,
    'accepted', TRUE,
    'replayed', FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seal_run_attempt(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seal_run_attempt(UUID, UUID, INTEGER)
  TO authenticated;

CREATE FUNCTION public.get_run_attempt_status(p_attempt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
    AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
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
    'started_at', v_attempt.started_at,
    'expires_at', v_attempt.expires_at,
    'last_sequence', v_attempt.last_sequence,
    'journal_hash', v_attempt.journal_hash,
    'finished_at', v_attempt.finished_at,
    'verified_at', v_attempt.verified_at,
    'rejected_at', v_attempt.rejected_at,
    'expired_at', v_attempt.expired_at,
    'result_hash', v_attempt.result_hash,
    'response', v_attempt.response,
    'rejection_code', v_attempt.rejection_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_run_attempt_status(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_run_attempt_status(UUID)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Trusted verifier lease and journal claim
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.claim_run_verification(
  p_attempt_id UUID,
  p_worker_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.run_attempts%ROWTYPE;
  v_commands JSONB := '[]'::JSONB;
  v_command_count INTEGER := 0;
  v_last_chain_hash TEXT;
  v_lease_token UUID;
  v_now TIMESTAMPTZ := CLOCK_TIMESTAMP();
BEGIN
  IF p_attempt_id IS NULL OR p_worker_id IS NULL THEN
    RAISE EXCEPTION 'invalid_verification_claim' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status IN ('verified', 'rejected', 'expired') THEN
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'claimed', FALSE,
      'response', v_attempt.response,
      'rejection_code', v_attempt.rejection_code
    );
  END IF;
  IF v_attempt.status <> 'finished' THEN
    RAISE EXCEPTION 'run_attempt_not_finished' USING ERRCODE = '55000';
  END IF;

  IF v_attempt.lease_token IS NOT NULL
    AND v_attempt.lease_expires_at > v_now
    AND v_attempt.lease_worker_id <> p_worker_id THEN
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', v_attempt.id,
      'status', 'finished',
      'claimed', FALSE,
      'in_progress', TRUE,
      'lease_expires_at', v_attempt.lease_expires_at
    );
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    MAX(command.chain_hash) FILTER (
      WHERE command.sequence = v_attempt.sealed_sequence
    ),
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'command_id', command.command_id,
          'sequence', command.sequence,
          'kind', command.kind,
          'payload', command.payload,
          'payload_hash', command.payload_hash,
          'previous_hash', command.previous_hash,
          'chain_hash', command.chain_hash,
          'received_at', command.received_at
        )
        ORDER BY command.sequence
      ),
      '[]'::JSONB
    )
  INTO v_command_count, v_last_chain_hash, v_commands
  FROM public.run_attempt_commands AS command
  WHERE command.attempt_id = v_attempt.id;

  IF v_command_count <> v_attempt.sealed_sequence
    OR (
      v_attempt.sealed_sequence > 0
      AND v_last_chain_hash IS DISTINCT FROM v_attempt.sealed_journal_hash
    )
    OR (
      v_attempt.sealed_sequence = 0
      AND v_attempt.journal_hash IS DISTINCT FROM v_attempt.sealed_journal_hash
    ) THEN
    UPDATE public.run_attempts
    SET
      status = 'rejected',
      rejection_code = 'journal_integrity_error',
      rejected_at = v_now,
      response = JSONB_BUILD_OBJECT(
        'attempt_id', v_attempt.id,
        'run_uuid', v_attempt.run_uuid,
        'status', 'rejected',
        'accepted', FALSE,
        'rejection_code', 'journal_integrity_error'
      )
    WHERE id = v_attempt.id;
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', v_attempt.id,
      'status', 'rejected',
      'claimed', FALSE,
      'rejection_code', 'journal_integrity_error'
    );
  END IF;

  IF v_attempt.lease_token IS NOT NULL
    AND v_attempt.lease_expires_at > v_now
    AND v_attempt.lease_worker_id = p_worker_id THEN
    v_lease_token := v_attempt.lease_token;
  ELSE
    v_lease_token := extensions.gen_random_uuid();
    UPDATE public.run_attempts
    SET
      lease_worker_id = p_worker_id,
      lease_token = v_lease_token,
      lease_expires_at = v_now + INTERVAL '5 minutes',
      verification_attempts = verification_attempts + 1
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;
  END IF;

  RETURN JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt.id,
    'user_id', v_attempt.user_id,
    'player_id', v_attempt.player_id,
    'run_uuid', v_attempt.run_uuid,
    'status', v_attempt.status,
    'claimed', TRUE,
    'lease_token', v_lease_token,
    'lease_expires_at', v_attempt.lease_expires_at,
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
    'started_at', v_attempt.started_at,
    'expires_at', v_attempt.expires_at,
    'finished_at', v_attempt.finished_at,
    'last_sequence', v_attempt.last_sequence,
    'journal_hash', v_attempt.journal_hash,
    'commands', v_commands
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_run_verification(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_run_verification(UUID, UUID)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic verified result persistence and progression credit
-- ---------------------------------------------------------------------------

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
  v_ruleset public.progression_rulesets%ROWTYPE;
  v_now TIMESTAMPTZ := CLOCK_TIMESTAMP();
  v_canonical_result_hash TEXT;
  v_key TEXT;
  v_won BOOLEAN;
  v_run_level INTEGER;
  v_waves_completed INTEGER;
  v_gold_earned INTEGER;
  v_allowed_biomes CONSTANT TEXT[] := ARRAY[
    'top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'
  ];
  v_biomes TEXT[] := ARRAY[]::TEXT[];
  v_augments TEXT[] := ARRAY[]::TEXT[];
  v_team_size INTEGER;
  v_member JSONB;
  v_member_key TEXT;
  v_champion_id TEXT;
  v_seen_champions TEXT[] := ARRAY[]::TEXT[];
  v_final_level INTEGER;
  v_final_hp INTEGER;
  v_kills INTEGER;
  v_damage BIGINT;
  v_items TEXT[];
  v_normalized_members JSONB := '[]'::JSONB;
  v_total_kills BIGINT := 0;
  v_total_damage BIGINT := 0;
  v_survivor_count INTEGER := 0;
  v_raw_candies INTEGER := 0;
  v_candies_per_champion INTEGER := 0;
  v_total_candies INTEGER := 0;
  v_run_id UUID;
  v_summary JSONB;
  v_response JSONB;
BEGIN
  IF p_attempt_id IS NULL
    OR p_lease_token IS NULL
    OR p_result IS NULL
    OR jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'invalid_verified_result' USING ERRCODE = '22023';
  END IF;
  IF p_result_hash IS NOT NULL AND p_result_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_result_hash' USING ERRCODE = '22023';
  END IF;

  -- PostgreSQL owns the canonical hash. The caller-provided hash is accepted as
  -- diagnostic metadata only because JSON.stringify and JSONB text are not the
  -- same canonicalization.
  v_canonical_result_hash := ENCODE(
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
      OR v_attempt.result_hash <> v_canonical_result_hash THEN
      RAISE EXCEPTION 'verified_result_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_SET(v_attempt.response, '{replayed}', 'true'::JSONB, TRUE);
  END IF;
  IF v_attempt.status = 'rejected' THEN
    RETURN COALESCE(
      v_attempt.response,
      JSONB_BUILD_OBJECT(
        'attempt_id', v_attempt.id,
        'run_uuid', v_attempt.run_uuid,
        'status', 'rejected',
        'accepted', FALSE,
        'rejection_code', v_attempt.rejection_code
      )
    );
  END IF;
  IF v_attempt.status <> 'finished'
    OR v_attempt.lease_token IS DISTINCT FROM p_lease_token
    OR v_attempt.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'verification_lease_invalid' USING ERRCODE = '55000';
  END IF;

  FOR v_key IN SELECT JSONB_OBJECT_KEYS(p_result)
  LOOP
    IF v_key <> ALL (ARRAY[
      'verified',
      'won',
      'run_level',
      'waves_completed',
      'biomes_visited',
      'gold_earned',
      'augment_ids',
      'team_members'
    ]::TEXT[]) THEN
      RAISE EXCEPTION 'unexpected_verified_result_field:%', v_key
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF p_result ? 'verified'
    AND (
      jsonb_typeof(p_result -> 'verified') <> 'boolean'
      OR NOT (p_result ->> 'verified')::BOOLEAN
    ) THEN
    RAISE EXCEPTION 'verified_result_required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_result -> 'won') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'invalid_verified_result:won' USING ERRCODE = '22023';
  END IF;
  v_won := (p_result ->> 'won')::BOOLEAN;

  SELECT * INTO v_ruleset
  FROM public.progression_rulesets
  WHERE version = v_attempt.ruleset_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'progression_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_run_level := public.progression_integer(
    p_result -> 'run_level', 1, 1, v_ruleset.max_run_level, 'run_level'
  )::INTEGER;
  v_waves_completed := public.progression_integer(
    p_result -> 'waves_completed',
    0,
    0,
    v_ruleset.max_waves_by_biome[CARDINALITY(v_ruleset.max_waves_by_biome)],
    'waves_completed'
  )::INTEGER;
  v_gold_earned := public.progression_integer(
    p_result -> 'gold_earned', 0, 0, 1000000, 'gold_earned'
  )::INTEGER;

  IF jsonb_typeof(p_result -> 'biomes_visited') IS DISTINCT FROM 'array'
    OR EXISTS (
      SELECT 1
      FROM JSONB_ARRAY_ELEMENTS(p_result -> 'biomes_visited') AS biome(value)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
    ) THEN
    RAISE EXCEPTION 'invalid_verified_result:biomes_visited' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
  INTO v_biomes
  FROM JSONB_ARRAY_ELEMENTS_TEXT(p_result -> 'biomes_visited')
    WITH ORDINALITY AS biome(value, ordinality);

  IF CARDINALITY(v_biomes) > CARDINALITY(v_allowed_biomes) THEN
    RAISE EXCEPTION 'invalid_verified_result:biomes_visited' USING ERRCODE = '22023';
  END IF;
  IF CARDINALITY(v_biomes) > 0 THEN
    FOR v_index IN 1..CARDINALITY(v_biomes)
    LOOP
      IF v_biomes[v_index] IS DISTINCT FROM v_allowed_biomes[v_index] THEN
        RAISE EXCEPTION 'invalid_verified_biome_path' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  IF v_won AND (
    CARDINALITY(v_biomes) <> CARDINALITY(v_allowed_biomes)
    OR v_waves_completed < v_ruleset.min_victory_waves
    OR v_run_level <> v_ruleset.max_run_level
  ) THEN
    RAISE EXCEPTION 'invalid_verified_victory' USING ERRCODE = '22023';
  END IF;
  IF NOT v_won AND v_run_level <> 1 THEN
    RAISE EXCEPTION 'invalid_verified_run_level' USING ERRCODE = '22023';
  END IF;
  IF v_waves_completed > 0 AND CARDINALITY(v_biomes) = 0 THEN
    RAISE EXCEPTION 'verified_waves_without_biome' USING ERRCODE = '22023';
  END IF;
  IF CARDINALITY(v_biomes) > 0
    AND v_waves_completed > v_ruleset.max_waves_by_biome[CARDINALITY(v_biomes)] THEN
    RAISE EXCEPTION 'verified_waves_out_of_range' USING ERRCODE = '22023';
  END IF;

  IF p_result ? 'augment_ids' THEN
    IF jsonb_typeof(p_result -> 'augment_ids') <> 'array'
      OR EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(p_result -> 'augment_ids') AS augment(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
      ) THEN
      RAISE EXCEPTION 'invalid_verified_result:augment_ids' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
    INTO v_augments
    FROM JSONB_ARRAY_ELEMENTS_TEXT(p_result -> 'augment_ids')
      WITH ORDINALITY AS augment(value, ordinality);
  END IF;
  IF CARDINALITY(v_augments) > 20
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT augment_id)
      FROM UNNEST(v_augments) AS augment_id
    )
    OR EXISTS (
      SELECT 1
      FROM UNNEST(v_augments) AS requested(augment_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.gameplay_content_catalog AS augment
        WHERE augment.gameplay_ruleset_version = v_attempt.gameplay_ruleset_version
          AND augment.content_type = 'augment'
          AND augment.content_id = requested.augment_id
          AND augment.active
      )
    ) THEN
    RAISE EXCEPTION 'invalid_verified_augment_loadout' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_result -> 'team_members') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_verified_result:team_members' USING ERRCODE = '22023';
  END IF;
  v_team_size := JSONB_ARRAY_LENGTH(p_result -> 'team_members');
  IF v_team_size < 1 OR v_team_size > v_ruleset.max_team_size THEN
    RAISE EXCEPTION 'invalid_verified_team_size' USING ERRCODE = '22023';
  END IF;

  FOR v_member IN SELECT value FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
  LOOP
    IF jsonb_typeof(v_member) <> 'object' THEN
      RAISE EXCEPTION 'invalid_verified_team_member' USING ERRCODE = '22023';
    END IF;
    FOR v_member_key IN SELECT JSONB_OBJECT_KEYS(v_member)
    LOOP
      IF v_member_key <> ALL (ARRAY[
        'champion_id',
        'final_level',
        'final_hp',
        'kills',
        'damage_dealt',
        'items_collected'
      ]::TEXT[]) THEN
        RAISE EXCEPTION 'unexpected_verified_team_field:%', v_member_key
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF jsonb_typeof(v_member -> 'champion_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid_verified_result:champion_id' USING ERRCODE = '22023';
    END IF;

    v_champion_id := BTRIM(v_member ->> 'champion_id');
    IF v_champion_id = ANY(v_seen_champions) THEN
      RAISE EXCEPTION 'duplicate_verified_champion:%', v_champion_id
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.progression_champion_catalog AS progression_champion
      JOIN public.gameplay_content_catalog AS gameplay_champion
        ON gameplay_champion.gameplay_ruleset_version =
          v_attempt.gameplay_ruleset_version
        AND gameplay_champion.content_type = 'champion'
        AND gameplay_champion.content_id = progression_champion.champion_id
      WHERE progression_champion.ruleset_version = v_attempt.ruleset_version
        AND progression_champion.champion_id = v_champion_id
    ) THEN
      RAISE EXCEPTION 'unsupported_verified_champion:%', v_champion_id
        USING ERRCODE = '22023';
    END IF;
    v_seen_champions := ARRAY_APPEND(v_seen_champions, v_champion_id);

    v_final_level := public.progression_integer(
      v_member -> 'final_level', 1, 1, 18, 'final_level'
    )::INTEGER;
    v_final_hp := public.progression_integer(
      v_member -> 'final_hp', 0, 0, 100000, 'final_hp'
    )::INTEGER;
    v_kills := public.progression_integer(
      v_member -> 'kills',
      0,
      0,
      GREATEST(20, v_waves_completed * 50),
      'kills'
    )::INTEGER;
    v_damage := public.progression_integer(
      v_member -> 'damage_dealt',
      0,
      0,
      GREATEST(1000000::BIGINT, v_waves_completed::BIGINT * 10000000),
      'damage_dealt'
    );

    IF v_member ? 'items_collected' THEN
      IF jsonb_typeof(v_member -> 'items_collected') <> 'array'
        OR EXISTS (
          SELECT 1
          FROM JSONB_ARRAY_ELEMENTS(v_member -> 'items_collected') AS item(value)
          WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
        ) THEN
        RAISE EXCEPTION 'invalid_verified_result:items_collected'
          USING ERRCODE = '22023';
      END IF;
      SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
      INTO v_items
      FROM JSONB_ARRAY_ELEMENTS_TEXT(v_member -> 'items_collected')
        WITH ORDINALITY AS item(value, ordinality);
    ELSE
      v_items := ARRAY[]::TEXT[];
    END IF;
    IF CARDINALITY(v_items) > 20
      OR EXISTS (
        SELECT 1
        FROM UNNEST(v_items) AS item_id
        WHERE item_id !~ '^[A-Za-z0-9_.:-]{1,100}$'
      ) THEN
      RAISE EXCEPTION 'invalid_verified_items' USING ERRCODE = '22023';
    END IF;

    v_total_kills := v_total_kills + v_kills;
    v_total_damage := v_total_damage + v_damage;
    v_survivor_count := v_survivor_count
      + CASE WHEN v_final_hp > 0 THEN 1 ELSE 0 END;
    v_normalized_members := v_normalized_members || JSONB_BUILD_ARRAY(
      JSONB_BUILD_OBJECT(
        'champion_id', v_champion_id,
        'final_level', v_final_level,
        'final_hp', v_final_hp,
        'kills', v_kills,
        'damage_dealt', v_damage,
        'items_collected', TO_JSONB(v_items)
      )
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM UNNEST(v_attempt.initial_team) AS initial(champion_id)
    WHERE initial.champion_id <> ALL (v_seen_champions)
  ) THEN
    RAISE EXCEPTION 'verified_result_missing_initial_champion'
      USING ERRCODE = '22023';
  END IF;
  IF v_won AND v_survivor_count = 0 THEN
    RAISE EXCEPTION 'invalid_verified_victory' USING ERRCODE = '22023';
  END IF;

  IF v_waves_completed > 0 THEN
    v_raw_candies :=
      v_ruleset.base_candies
      + v_waves_completed * v_ruleset.candies_per_wave
      + CARDINALITY(v_biomes) * v_ruleset.candies_per_biome
      + CASE WHEN v_won THEN v_ruleset.victory_bonus ELSE 0 END;
    v_candies_per_champion := GREATEST(
      1,
      FLOOR(v_raw_candies::NUMERIC / v_team_size)::INTEGER
    );
    v_total_candies := v_candies_per_champion * v_team_size;
  END IF;

  -- Re-lock the canonical player row before any aggregate mutation. This is
  -- the same serialization point used by starts and enhancement purchases.
  PERFORM 1
  FROM public.players
  WHERE id = v_attempt.player_id
    AND user_id = v_attempt.user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.runs (
    player_id,
    run_uuid,
    won,
    run_level,
    waves_completed,
    biomes_visited,
    gold_earned,
    total_kills,
    total_damage_dealt,
    candies_earned,
    seed,
    rune_ids,
    augment_ids,
    started_at,
    completed_at,
    progression_version,
    progression_payload_hash,
    progression_source,
    run_attempt_id
  )
  VALUES (
    v_attempt.player_id,
    v_attempt.run_uuid,
    v_won,
    v_run_level,
    v_waves_completed,
    v_biomes,
    v_gold_earned,
    v_total_kills,
    v_total_damage,
    v_total_candies,
    v_attempt.seed,
    v_attempt.rune_ids,
    v_augments,
    v_attempt.started_at,
    COALESCE(v_attempt.finished_at, v_now),
    v_attempt.ruleset_version,
    v_canonical_result_hash,
    'verified',
    v_attempt.id
  )
  RETURNING id INTO v_run_id;

  FOR v_member IN SELECT value FROM JSONB_ARRAY_ELEMENTS(v_normalized_members)
  LOOP
    INSERT INTO public.run_team_members (
      run_id,
      champion_id,
      final_level,
      final_hp,
      survived,
      kills,
      damage_dealt,
      items_collected
    )
    VALUES (
      v_run_id,
      v_member ->> 'champion_id',
      (v_member ->> 'final_level')::INTEGER,
      (v_member ->> 'final_hp')::INTEGER,
      (v_member ->> 'final_hp')::INTEGER > 0,
      (v_member ->> 'kills')::INTEGER,
      (v_member ->> 'damage_dealt')::BIGINT,
      ARRAY(
        SELECT JSONB_ARRAY_ELEMENTS_TEXT(v_member -> 'items_collected')
      )
    );
  END LOOP;

  UPDATE public.players
  SET
    total_runs_completed = total_runs_completed + 1,
    total_wins = total_wins + CASE WHEN v_won THEN 1 ELSE 0 END,
    total_waves_completed = total_waves_completed + v_waves_completed,
    total_candies = total_candies + v_total_candies
  WHERE id = v_attempt.player_id;

  IF v_candies_per_champion > 0 THEN
    FOR v_member IN SELECT value FROM JSONB_ARRAY_ELEMENTS(v_normalized_members)
    LOOP
      INSERT INTO public.champion_mastery (
        player_id,
        champion_id,
        total_candies,
        mastery_level,
        current_level_candies,
        unlocked_ids,
        games_played,
        games_won,
        total_kills,
        total_damage_dealt
      )
      VALUES (
        v_attempt.player_id,
        v_member ->> 'champion_id',
        v_candies_per_champion,
        public.mastery_level_from_candies(v_candies_per_champion),
        public.mastery_current_level_candies(v_candies_per_champion),
        public.mastery_unlock_ids(v_candies_per_champion),
        1,
        CASE WHEN v_won THEN 1 ELSE 0 END,
        (v_member ->> 'kills')::INTEGER,
        (v_member ->> 'damage_dealt')::BIGINT
      )
      ON CONFLICT (player_id, champion_id) DO UPDATE SET
        total_candies =
          public.champion_mastery.total_candies + EXCLUDED.total_candies,
        mastery_level = public.mastery_level_from_candies(
          public.champion_mastery.total_candies + EXCLUDED.total_candies
        ),
        current_level_candies = public.mastery_current_level_candies(
          public.champion_mastery.total_candies + EXCLUDED.total_candies
        ),
        unlocked_ids = public.mastery_unlock_ids(
          public.champion_mastery.total_candies + EXCLUDED.total_candies
        ),
        games_played = public.champion_mastery.games_played + 1,
        games_won = public.champion_mastery.games_won + EXCLUDED.games_won,
        total_kills = public.champion_mastery.total_kills + EXCLUDED.total_kills,
        total_damage_dealt =
          public.champion_mastery.total_damage_dealt + EXCLUDED.total_damage_dealt,
        updated_at = NOW();
    END LOOP;
  END IF;

  SELECT JSONB_BUILD_OBJECT(
    'won', v_won,
    'waves_completed', v_waves_completed,
    'biomes_visited', TO_JSONB(v_biomes),
    'gold_earned', v_gold_earned,
    'run_level', v_run_level,
    'total_kills', v_total_kills,
    'total_damage', v_total_damage,
    'champion_stats', COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'champion_id', member.value ->> 'champion_id',
          'kills', (member.value ->> 'kills')::INTEGER,
          'total_damage', (member.value ->> 'damage_dealt')::BIGINT,
          'survived', (member.value ->> 'final_hp')::INTEGER > 0
        )
        ORDER BY member.value ->> 'champion_id'
      ),
      '[]'::JSONB
    )
  )
  INTO v_summary
  FROM JSONB_ARRAY_ELEMENTS(v_normalized_members) AS member(value);

  v_response := JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt.id,
    'run_id', v_run_id,
    'run_uuid', v_attempt.run_uuid,
    'status', 'verified',
    'accepted', TRUE,
    'replayed', FALSE,
    'candies_earned', v_total_candies,
    'candies_per_champion', v_candies_per_champion,
    'progression_version', v_attempt.ruleset_version,
    'gameplay_ruleset_version', v_attempt.gameplay_ruleset_version,
    'engine_version', v_attempt.engine_version,
    'progression_source', 'verified',
    'result_hash', v_canonical_result_hash,
    'summary', v_summary
  );

  UPDATE public.run_attempts
  SET
    status = 'verified',
    result_hash = v_canonical_result_hash,
    result = p_result,
    response = v_response,
    result_run_id = v_run_id,
    verified_at = v_now,
    lease_expires_at = NULL
  WHERE id = v_attempt.id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

CREATE FUNCTION public.reject_run_verification(
  p_attempt_id UUID,
  p_lease_token UUID,
  p_rejection_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.run_attempts%ROWTYPE;
  v_reason_code TEXT := BTRIM(COALESCE(p_rejection_code, ''));
  v_response JSONB;
BEGIN
  IF p_attempt_id IS NULL
    OR p_lease_token IS NULL
    OR v_reason_code !~ '^[a-z0-9_:-]{1,100}$' THEN
    RAISE EXCEPTION 'invalid_verification_rejection' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status = 'rejected' THEN
    IF v_attempt.lease_token <> p_lease_token
      OR v_attempt.rejection_code <> v_reason_code THEN
      RAISE EXCEPTION 'verification_rejection_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_SET(v_attempt.response, '{replayed}', 'true'::JSONB, TRUE);
  END IF;
  IF v_attempt.status <> 'finished'
    OR v_attempt.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'verification_lease_invalid' USING ERRCODE = '55000';
  END IF;

  v_response := JSONB_BUILD_OBJECT(
    'attempt_id', v_attempt.id,
    'run_uuid', v_attempt.run_uuid,
    'status', 'rejected',
    'accepted', FALSE,
    'replayed', FALSE,
    'rejection_code', v_reason_code
  );

  -- Return instead of raising after this update: raising would roll the durable
  -- rejection back and leave an illegal journal leased indefinitely.
  UPDATE public.run_attempts
  SET
    status = 'rejected',
    rejection_code = v_reason_code,
    rejected_at = CLOCK_TIMESTAMP(),
    response = v_response,
    lease_expires_at = NULL
  WHERE id = v_attempt.id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_run_verification(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_run_verification(UUID, UUID, TEXT)
  TO service_role;

COMMIT;
