-- Make mastery an immutable, account-scoped input of every verified run.
-- Guest progression stays browser-local and is never imported by these paths.

BEGIN;

CREATE OR REPLACE FUNCTION public.mastery_unlock_ids(p_candies INTEGER)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_candies >= 350 THEN ARRAY['starter_slot_2', 'starter_slot_3']::TEXT[]
    WHEN p_candies >= 50 THEN ARRAY['starter_slot_2']::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END
$$;

UPDATE public.champion_mastery
SET unlocked_ids = public.mastery_unlock_ids(total_candies)
WHERE unlocked_ids IS DISTINCT FROM public.mastery_unlock_ids(total_candies);

ALTER TABLE public.run_attempts
  ADD COLUMN mastery_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (JSONB_TYPEOF(mastery_snapshot) = 'object');

CREATE FUNCTION public.freeze_run_attempt_mastery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT COALESCE(
    JSONB_OBJECT_AGG(
      champion.content_id,
      COALESCE(mastery.mastery_level, 0)
      ORDER BY champion.content_id
    ),
    '{}'::JSONB
  )
  INTO NEW.mastery_snapshot
  FROM public.gameplay_content_catalog AS champion
  LEFT JOIN public.champion_mastery AS mastery
    ON mastery.player_id = NEW.player_id
    AND mastery.champion_id = champion.content_id
  WHERE champion.gameplay_ruleset_version = NEW.gameplay_ruleset_version
    AND champion.content_type = 'champion'
    AND champion.active;

  IF EXISTS (
    SELECT 1
    FROM JSONB_EACH(NEW.mastery_snapshot) AS entry(champion_id, mastery_level)
    WHERE JSONB_TYPEOF(mastery_level) <> 'number'
      OR (mastery_level #>> '{}')::INTEGER NOT BETWEEN 0 AND 4
  ) THEN
    RAISE EXCEPTION 'invalid_mastery_snapshot' USING ERRCODE = '22023';
  END IF;

  -- This trigger runs after the daily-normalization and contract triggers.
  -- The immutable mastery input is therefore covered by the root journal hash.
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
          'enhancement_snapshot', NEW.enhancement_snapshot,
          'mastery_snapshot', NEW.mastery_snapshot
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

REVOKE ALL ON FUNCTION public.freeze_run_attempt_mastery()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER run_attempts_zz_freeze_mastery
  BEFORE INSERT ON public.run_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_run_attempt_mastery();

ALTER FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT)
  RENAME TO start_run_attempt_v7;
REVOKE ALL ON FUNCTION public.start_run_attempt_v7(UUID, TEXT[], TEXT[], TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_started JSONB;
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  v_started := public.start_run_attempt_v7(
    p_command_id,
    p_team,
    p_rune_ids,
    p_difficulty,
    p_mode
  );

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = (v_started ->> 'attempt_id')::UUID
    AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_started || JSONB_BUILD_OBJECT(
    'mastery_snapshot', v_attempt.mastery_snapshot,
    'journal_hash', v_attempt.journal_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT)
  TO authenticated;

ALTER FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[])
  RENAME TO start_daily_run_attempt_v7;
REVOKE ALL ON FUNCTION public.start_daily_run_attempt_v7(UUID, TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_started JSONB;
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  v_started := public.start_daily_run_attempt_v7(p_command_id, p_team, p_rune_ids);

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = (v_started ->> 'attempt_id')::UUID
    AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'official_daily_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_started || JSONB_BUILD_OBJECT(
    'mastery_snapshot', v_attempt.mastery_snapshot,
    'journal_hash', v_attempt.journal_hash
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[])
  TO authenticated;

ALTER FUNCTION public.claim_run_verification(UUID, UUID)
  RENAME TO claim_run_verification_v7;
REVOKE ALL ON FUNCTION public.claim_run_verification_v7(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_claim JSONB;
  v_mastery_snapshot JSONB;
BEGIN
  v_claim := public.claim_run_verification_v7(p_attempt_id, p_worker_id);
  IF COALESCE((v_claim ->> 'claimed')::BOOLEAN, FALSE) THEN
    SELECT mastery_snapshot INTO v_mastery_snapshot
    FROM public.run_attempts
    WHERE id = p_attempt_id;
    v_claim := v_claim || JSONB_BUILD_OBJECT(
      'mastery_snapshot',
      COALESCE(v_mastery_snapshot, '{}'::JSONB)
    );
  END IF;
  RETURN v_claim;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_run_verification(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_run_verification(UUID, UUID)
  TO service_role;

COMMIT;
