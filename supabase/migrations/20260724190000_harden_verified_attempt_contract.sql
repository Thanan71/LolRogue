-- Close the remaining trust gaps found during integrated verified-run review.
--
-- Historical enhancement JSON was writable before the progression hardening
-- migration. Preserve it for audit, but only retain ranks that can be proven by
-- a completed server-owned progression command. Also enforce the actual starter
-- and rune contract at the run_attempt table boundary and expose a narrow lazy
-- expiry command for stale attempts.

BEGIN;

-- ---------------------------------------------------------------------------
-- Quarantine enhancement ranks that predate server-owned purchase commands
-- ---------------------------------------------------------------------------

CREATE TABLE public.progression_enhancement_security_baselines (
  user_id UUID NOT NULL,
  champion_id TEXT NOT NULL,
  baseline_code TEXT NOT NULL,
  -- Historical values were once client-writable and may not even be objects.
  -- Preserve the exact JSON value instead of letting malformed legacy data
  -- block the security migration.
  original_unlocked_nodes JSONB NOT NULL,
  retained_verified_nodes JSONB NOT NULL
    CHECK (jsonb_typeof(retained_verified_nodes) = 'object'),
  policy TEXT NOT NULL CHECK (
    policy = 'quarantine_unattested_ranks_preserve_audit_copy'
  ),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, champion_id, baseline_code)
);

ALTER TABLE public.progression_enhancement_security_baselines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.progression_enhancement_security_baselines
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.progression_enhancement_security_baselines
  TO service_role;

WITH attested_ranks AS (
  SELECT
    command.user_id,
    command.response ->> 'champion_id' AS champion_id,
    command.response ->> 'node_id' AS node_id,
    MAX((command.response ->> 'current_rank')::INTEGER) AS current_rank
  FROM public.progression_commands AS command
  JOIN public.progression_champion_catalog AS champion
    ON champion.ruleset_version = command.ruleset_version
    AND champion.champion_id = command.response ->> 'champion_id'
    AND champion.active
  JOIN public.enhancement_node_catalog AS node
    ON node.ruleset_version = command.ruleset_version
    AND node.node_id = command.response ->> 'node_id'
    AND node.champion_role = champion.primary_role
    AND node.active
  WHERE command.command_type = 'enhancement_unlock'
    AND command.completed_at IS NOT NULL
    AND jsonb_typeof(command.response) = 'object'
    AND jsonb_typeof(command.response -> 'champion_id') = 'string'
    AND jsonb_typeof(command.response -> 'node_id') = 'string'
    AND jsonb_typeof(command.response -> 'current_rank') = 'number'
    AND (command.response ->> 'current_rank') ~ '^[1-9][0-9]*$'
    AND (command.response ->> 'current_rank')::INTEGER <= node.max_rank
    AND NOT EXISTS (
      SELECT 1
      FROM UNNEST(node.prerequisite_node_ids) AS prerequisite(node_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.progression_commands AS prerequisite_command
        WHERE prerequisite_command.user_id = command.user_id
          AND prerequisite_command.ruleset_version = command.ruleset_version
          AND prerequisite_command.command_type = 'enhancement_unlock'
          AND prerequisite_command.completed_at IS NOT NULL
          AND prerequisite_command.response ->> 'champion_id' =
            command.response ->> 'champion_id'
          AND prerequisite_command.response ->> 'node_id' = prerequisite.node_id
          AND jsonb_typeof(prerequisite_command.response -> 'current_rank') = 'number'
          AND (prerequisite_command.response ->> 'current_rank') ~ '^[1-9][0-9]*$'
      )
    )
  GROUP BY
    command.user_id,
    command.response ->> 'champion_id',
    command.response ->> 'node_id'
),
attested_snapshots AS (
  SELECT
    user_id,
    champion_id,
    JSONB_OBJECT_AGG(node_id, current_rank ORDER BY node_id) AS unlocked_nodes
  FROM attested_ranks
  GROUP BY user_id, champion_id
)
INSERT INTO public.progression_enhancement_security_baselines (
  user_id,
  champion_id,
  baseline_code,
  original_unlocked_nodes,
  retained_verified_nodes,
  policy
)
SELECT
  enhancement.user_id,
  enhancement.champion_id,
  'verified-enhancement-cutoff-v1',
  enhancement.unlocked_nodes,
  COALESCE(snapshot.unlocked_nodes, '{}'::JSONB),
  'quarantine_unattested_ranks_preserve_audit_copy'
FROM public.champion_enhancements AS enhancement
LEFT JOIN attested_snapshots AS snapshot
  ON snapshot.user_id = enhancement.user_id
  AND snapshot.champion_id = enhancement.champion_id
WHERE enhancement.unlocked_nodes IS DISTINCT FROM
  COALESCE(snapshot.unlocked_nodes, '{}'::JSONB);

WITH attested_ranks AS (
  SELECT
    command.user_id,
    command.response ->> 'champion_id' AS champion_id,
    command.response ->> 'node_id' AS node_id,
    MAX((command.response ->> 'current_rank')::INTEGER) AS current_rank
  FROM public.progression_commands AS command
  JOIN public.progression_champion_catalog AS champion
    ON champion.ruleset_version = command.ruleset_version
    AND champion.champion_id = command.response ->> 'champion_id'
    AND champion.active
  JOIN public.enhancement_node_catalog AS node
    ON node.ruleset_version = command.ruleset_version
    AND node.node_id = command.response ->> 'node_id'
    AND node.champion_role = champion.primary_role
    AND node.active
  WHERE command.command_type = 'enhancement_unlock'
    AND command.completed_at IS NOT NULL
    AND jsonb_typeof(command.response) = 'object'
    AND jsonb_typeof(command.response -> 'champion_id') = 'string'
    AND jsonb_typeof(command.response -> 'node_id') = 'string'
    AND jsonb_typeof(command.response -> 'current_rank') = 'number'
    AND (command.response ->> 'current_rank') ~ '^[1-9][0-9]*$'
    AND (command.response ->> 'current_rank')::INTEGER <= node.max_rank
    AND NOT EXISTS (
      SELECT 1
      FROM UNNEST(node.prerequisite_node_ids) AS prerequisite(node_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.progression_commands AS prerequisite_command
        WHERE prerequisite_command.user_id = command.user_id
          AND prerequisite_command.ruleset_version = command.ruleset_version
          AND prerequisite_command.command_type = 'enhancement_unlock'
          AND prerequisite_command.completed_at IS NOT NULL
          AND prerequisite_command.response ->> 'champion_id' =
            command.response ->> 'champion_id'
          AND prerequisite_command.response ->> 'node_id' = prerequisite.node_id
          AND jsonb_typeof(prerequisite_command.response -> 'current_rank') = 'number'
          AND (prerequisite_command.response ->> 'current_rank') ~ '^[1-9][0-9]*$'
      )
    )
  GROUP BY
    command.user_id,
    command.response ->> 'champion_id',
    command.response ->> 'node_id'
),
attested_snapshots AS (
  SELECT
    user_id,
    champion_id,
    JSONB_OBJECT_AGG(node_id, current_rank ORDER BY node_id) AS unlocked_nodes
  FROM attested_ranks
  GROUP BY user_id, champion_id
)
UPDATE public.champion_enhancements AS enhancement
SET
  unlocked_nodes = COALESCE(snapshot.unlocked_nodes, '{}'::JSONB),
  updated_at = NOW()
FROM (
  SELECT
    existing.user_id,
    existing.champion_id,
    attested_snapshots.unlocked_nodes
  FROM public.champion_enhancements AS existing
  LEFT JOIN attested_snapshots
    ON attested_snapshots.user_id = existing.user_id
    AND attested_snapshots.champion_id = existing.champion_id
) AS snapshot
WHERE enhancement.user_id = snapshot.user_id
  AND enhancement.champion_id = snapshot.champion_id
  AND enhancement.unlocked_nodes IS DISTINCT FROM
    COALESCE(snapshot.unlocked_nodes, '{}'::JSONB);

-- Attempts created before the quarantine may already contain a frozen copy of
-- untrusted ranks. They cannot be made trustworthy retroactively, so release
-- the account and deny those in-flight journals without deleting their audit
-- records or commands.
UPDATE public.run_attempts
SET
  status = 'expired',
  expired_at = CLOCK_TIMESTAMP(),
  lease_worker_id = NULL,
  lease_token = NULL,
  lease_expires_at = NULL
WHERE status IN ('started', 'finished');

-- ---------------------------------------------------------------------------
-- Enforce the reachable client loadout at the durable table boundary
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.enforce_verified_run_attempt_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF CARDINALITY(NEW.initial_team) <> 1 THEN
    RAISE EXCEPTION 'verified_run_requires_one_starter' USING ERRCODE = '22023';
  END IF;

  IF CARDINALITY(NEW.rune_ids) > 3
    OR ARRAY_POSITION(NEW.rune_ids, NULL) IS NOT NULL
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT rune_id)
      FROM UNNEST(NEW.rune_ids) AS rune_id
    )
    OR EXISTS (
      SELECT 1
      FROM UNNEST(NEW.rune_ids) AS rune_id
      WHERE rune_id <> ALL (ARRAY[
        'press_the_attack',
        'electrocute',
        'summon_aery',
        'grasp_of_the_undying',
        'glacial_augment'
      ]::TEXT[])
    ) THEN
    RAISE EXCEPTION 'invalid_verified_starter_runes' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_verified_run_attempt_contract()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER run_attempts_enforce_verified_contract
  BEFORE INSERT OR UPDATE OF initial_team, rune_ids
  ON public.run_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_verified_run_attempt_contract();

-- ---------------------------------------------------------------------------
-- Lazy expiry used before starts/status checks; includes sealed attempts
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.expire_stale_run_attempts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_expired INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.run_attempts
  SET
    status = 'expired',
    expired_at = CLOCK_TIMESTAMP(),
    lease_worker_id = NULL,
    lease_token = NULL,
    lease_expires_at = NULL
  WHERE user_id = v_user_id
    AND status IN ('started', 'finished')
    AND expires_at <= CLOCK_TIMESTAMP();

  GET DIAGNOSTICS v_expired = ROW_COUNT;
  RETURN JSONB_BUILD_OBJECT('expired', v_expired);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_run_attempts()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_run_attempts()
  TO authenticated;

COMMIT;
