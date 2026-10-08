-- P3-ECO-01: account shards are independent of champion mastery and run gold.
-- The economy ships disabled. A service-only activation records its cutoff and
-- grants historical roster access before any new-account locks take effect.
BEGIN;

CREATE TABLE public.champion_economy_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  economy_version SMALLINT NOT NULL DEFAULT 1 CHECK (economy_version = 1),
  catalog_version SMALLINT NOT NULL DEFAULT 1 CHECK (catalog_version > 0),
  gameplay_ruleset_version SMALLINT NOT NULL REFERENCES public.gameplay_rulesets(version),
  activated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP()
);
INSERT INTO public.champion_economy_config (gameplay_ruleset_version) VALUES (21);

CREATE TABLE public.champion_economy_catalog (
  catalog_version SMALLINT NOT NULL CHECK (catalog_version > 0),
  champion_id TEXT NOT NULL CHECK (champion_id ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  price_shards BIGINT NOT NULL CHECK (price_shards > 0),
  permanent_free BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (catalog_version, champion_id)
);
INSERT INTO public.champion_economy_catalog
  (catalog_version, champion_id, price_shards, permanent_free)
SELECT 1, champion_id, 400, champion_id = ANY (ARRAY['Garen', 'Annie', 'Ashe'])
FROM UNNEST(ARRAY[
  'Annie', 'Ashe', 'Darius', 'Garen', 'Jinx', 'Leona', 'Lux', 'Malphite', 'Soraka', 'Warwick'
]) AS champions(champion_id);

CREATE TABLE public.account_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shards_balance BIGINT NOT NULL DEFAULT 0 CHECK (shards_balance >= 0),
  lifetime_shards_earned BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_shards_earned >= 0),
  lifetime_shards_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_shards_spent >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  CHECK (shards_balance = lifetime_shards_earned - lifetime_shards_spent)
);

CREATE TABLE public.champion_rotations (
  id TEXT PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  ruleset_version SMALLINT NOT NULL REFERENCES public.gameplay_rulesets(version),
  catalog_version SMALLINT NOT NULL CHECK (catalog_version > 0),
  algorithm_version SMALLINT NOT NULL CHECK (algorithm_version = 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  UNIQUE (starts_at, ruleset_version, algorithm_version),
  CHECK (ends_at = starts_at + INTERVAL '168 hours'),
  CHECK (starts_at = DATE_TRUNC('week', starts_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
);

CREATE TABLE public.champion_rotation_entries (
  rotation_id TEXT NOT NULL REFERENCES public.champion_rotations(id) ON DELETE RESTRICT,
  champion_id TEXT NOT NULL,
  display_order SMALLINT NOT NULL CHECK (display_order BETWEEN 0 AND 4),
  PRIMARY KEY (rotation_id, champion_id),
  UNIQUE (rotation_id, display_order)
);

CREATE TABLE public.shard_transactions (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL CHECK (reason IN (
    'run_reward', 'rotation_first_win', 'champion_purchase', 'legacy_adjustment', 'admin_adjustment'
  )),
  run_attempt_id UUID REFERENCES public.run_attempts(id) ON DELETE CASCADE,
  champion_id TEXT,
  rotation_id TEXT REFERENCES public.champion_rotations(id) ON DELETE RESTRICT,
  economy_version SMALLINT NOT NULL CHECK (economy_version > 0),
  gameplay_ruleset_version SMALLINT REFERENCES public.gameplay_rulesets(version),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  CHECK (reason NOT IN ('run_reward', 'rotation_first_win') OR (
    run_attempt_id IS NOT NULL AND amount > 0 AND gameplay_ruleset_version IS NOT NULL
  )),
  CHECK (reason <> 'rotation_first_win' OR (rotation_id IS NOT NULL AND champion_id IS NOT NULL)),
  CHECK (reason <> 'champion_purchase' OR (amount < 0 AND champion_id IS NOT NULL))
);
CREATE INDEX shard_transactions_user_created ON public.shard_transactions(user_id, created_at DESC, id DESC);
CREATE INDEX shard_transactions_attempt ON public.shard_transactions(run_attempt_id) WHERE run_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX shard_transactions_first_rotation_win
  ON public.shard_transactions(user_id, rotation_id, champion_id)
  WHERE reason = 'rotation_first_win';

CREATE TABLE public.account_champion_unlocks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  champion_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  source TEXT NOT NULL CHECK (source IN ('purchase', 'legacy_grant', 'admin_grant')),
  price_paid BIGINT NOT NULL DEFAULT 0 CHECK (price_paid >= 0),
  transaction_id UUID UNIQUE REFERENCES public.shard_transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, champion_id),
  CHECK ((source = 'purchase' AND price_paid > 0 AND transaction_id IS NOT NULL)
    OR (source <> 'purchase' AND price_paid = 0 AND transaction_id IS NULL))
);

CREATE TABLE public.champion_purchase_commands (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command_id UUID NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  transaction_id UUID NOT NULL UNIQUE REFERENCES public.shard_transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CLOCK_TIMESTAMP(),
  PRIMARY KEY (user_id, command_id)
);

ALTER TABLE public.champion_economy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_economy_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_rotation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shard_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_champion_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_purchase_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.champion_economy_config, public.champion_economy_catalog,
  public.account_wallets, public.champion_rotations, public.champion_rotation_entries,
  public.shard_transactions, public.account_champion_unlocks, public.champion_purchase_commands
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.champion_economy_config, public.champion_economy_catalog,
  public.account_wallets, public.champion_rotations, public.champion_rotation_entries,
  public.shard_transactions, public.account_champion_unlocks, public.champion_purchase_commands
  TO service_role;
GRANT SELECT ON TABLE public.account_wallets, public.shard_transactions, public.account_champion_unlocks
  TO authenticated;
CREATE POLICY account_wallets_owner_read ON public.account_wallets FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY shard_transactions_owner_read ON public.shard_transactions FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY account_champion_unlocks_owner_read ON public.account_champion_unlocks FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Economy helper functions are private and have no direct API execution grant.
CREATE FUNCTION private.champion_economy_now()
RETURNS TIMESTAMPTZ LANGUAGE sql VOLATILE SET search_path = '' AS $$
  SELECT CLOCK_TIMESTAMP()
$$;
REVOKE ALL ON FUNCTION private.champion_economy_now() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.champion_economy_account_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM auth.users WHERE id = (SELECT auth.uid()) AND NOT COALESCE(is_anonymous, FALSE)
$$;
REVOKE ALL ON FUNCTION private.champion_economy_account_id() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.champion_economy_preserve_ledger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Account erasure may cascade personal economy rows; ordinary history is immutable.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'shard_ledger_append_only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION private.champion_economy_preserve_ledger() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER shard_transactions_append_only BEFORE UPDATE OR DELETE ON public.shard_transactions
  FOR EACH ROW EXECUTE FUNCTION private.champion_economy_preserve_ledger();

CREATE FUNCTION private.materialize_champion_rotation(p_instant TIMESTAMPTZ, p_ruleset SMALLINT, p_catalog SMALLINT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_start TIMESTAMPTZ := DATE_TRUNC('week', p_instant AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_id TEXT := TO_CHAR(v_start AT TIME ZONE 'UTC', 'IYYY-"W"IW') || '-v1-r' || p_ruleset::TEXT;
  v_pool TEXT[];
  v_count INTEGER;
  v_week BIGINT;
  v_offset INTEGER;
BEGIN
  -- Published periods are read without a global lock; only creation contends.
  IF EXISTS (SELECT 1 FROM public.champion_rotations WHERE id = v_id) THEN
    RETURN v_id;
  END IF;
  -- A transaction-scoped lock serializes first readers at a period boundary.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('champion_rotation:' || v_id, 0));
  IF EXISTS (SELECT 1 FROM public.champion_rotations WHERE id = v_id) THEN
    RETURN v_id;
  END IF;
  SELECT ARRAY_AGG(catalog.champion_id ORDER BY catalog.champion_id COLLATE "C") INTO v_pool
  FROM public.champion_economy_catalog AS catalog
  JOIN public.gameplay_content_catalog AS gameplay
    ON gameplay.gameplay_ruleset_version = p_ruleset AND gameplay.content_type = 'champion'
    AND gameplay.content_id = catalog.champion_id AND gameplay.active
  WHERE catalog.catalog_version = p_catalog AND NOT catalog.permanent_free;
  v_count := COALESCE(CARDINALITY(v_pool), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'champion_catalog_mismatch' USING ERRCODE = '22023';
  END IF;
  v_week := FLOOR(EXTRACT(EPOCH FROM (v_start - TIMESTAMPTZ '2026-01-05 00:00:00+00')) / 604800)::BIGINT;
  v_offset := ((v_week % v_count + v_count) % v_count)::INTEGER;
  INSERT INTO public.champion_rotations(id, starts_at, ends_at, ruleset_version, catalog_version, algorithm_version)
  VALUES (v_id, v_start, v_start + INTERVAL '168 hours', p_ruleset, p_catalog, 1);
  FOR v_index IN 0..LEAST(5, v_count) - 1 LOOP
    INSERT INTO public.champion_rotation_entries(rotation_id, champion_id, display_order)
    VALUES (v_id, v_pool[((v_offset + v_index) % v_count) + 1], v_index);
  END LOOP;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION private.materialize_champion_rotation(TIMESTAMPTZ, SMALLINT, SMALLINT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.initialize_champion_economy_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_config public.champion_economy_config%ROWTYPE;
BEGIN
  IF COALESCE(NEW.is_anonymous, FALSE) THEN RETURN NEW; END IF;
  SELECT * INTO v_config FROM public.champion_economy_config WHERE singleton FOR SHARE;
  INSERT INTO public.account_wallets(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  IF v_config.activated_at IS NOT NULL AND NEW.created_at < v_config.activated_at THEN
    INSERT INTO public.account_champion_unlocks(user_id, champion_id, source)
    SELECT NEW.id, champion_id, 'legacy_grant'
    FROM public.champion_economy_catalog WHERE catalog_version = v_config.catalog_version
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.initialize_champion_economy_account() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER auth_user_champion_economy AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.initialize_champion_economy_account();
INSERT INTO public.account_wallets(user_id)
SELECT id FROM auth.users WHERE NOT COALESCE(is_anonymous, FALSE) ON CONFLICT DO NOTHING;

CREATE FUNCTION public.get_champion_economy_snapshot()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_config public.champion_economy_config%ROWTYPE;
  v_user UUID := private.champion_economy_account_id();
  v_now TIMESTAMPTZ := private.champion_economy_now();
  v_rotation_id TEXT;
  v_rotation JSONB;
  v_catalog JSONB;
  v_wallet JSONB;
  v_owned JSONB := '[]'::JSONB;
  v_first_wins JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO STRICT v_config FROM public.champion_economy_config WHERE singleton;
  IF NOT EXISTS (SELECT 1 FROM public.gameplay_rulesets
    WHERE is_active AND version = v_config.gameplay_ruleset_version)
    OR (SELECT COUNT(*) FROM public.champion_economy_catalog
        WHERE catalog_version = v_config.catalog_version) <> (
      SELECT COUNT(*) FROM public.champion_economy_catalog AS catalog
      JOIN public.gameplay_content_catalog AS gameplay
        ON gameplay.gameplay_ruleset_version = v_config.gameplay_ruleset_version
        AND gameplay.content_type = 'champion' AND gameplay.content_id = catalog.champion_id AND gameplay.active
      WHERE catalog.catalog_version = v_config.catalog_version
    ) OR (SELECT COUNT(*) FROM public.champion_economy_catalog
      WHERE catalog_version = v_config.catalog_version) <> (
        SELECT COUNT(*) FROM public.gameplay_content_catalog
        WHERE gameplay_ruleset_version = v_config.gameplay_ruleset_version AND content_type = 'champion' AND active
      ) THEN
    RAISE EXCEPTION 'champion_catalog_mismatch' USING ERRCODE = '22023';
  END IF;
  v_rotation_id := private.materialize_champion_rotation(v_now, v_config.gameplay_ruleset_version, v_config.catalog_version);
  SELECT JSONB_BUILD_OBJECT('id', rotation.id, 'startsAt', rotation.starts_at, 'endsAt', rotation.ends_at,
    'rulesetVersion', rotation.ruleset_version, 'algorithmVersion', rotation.algorithm_version,
    'championIds', (SELECT JSONB_AGG(champion_id ORDER BY display_order)
      FROM public.champion_rotation_entries WHERE rotation_id = rotation.id))
  INTO v_rotation FROM public.champion_rotations AS rotation WHERE id = v_rotation_id;
  SELECT JSONB_AGG(JSONB_BUILD_OBJECT('championId', champion_id, 'priceShards', price_shards,
    'permanentFree', permanent_free) ORDER BY champion_id COLLATE "C")
  INTO v_catalog FROM public.champion_economy_catalog WHERE catalog_version = v_config.catalog_version;
  IF v_user IS NOT NULL THEN
    SELECT JSONB_BUILD_OBJECT('shardsBalance', shards_balance, 'lifetimeEarned', lifetime_shards_earned,
      'lifetimeSpent', lifetime_shards_spent) INTO v_wallet FROM public.account_wallets WHERE user_id = v_user;
    SELECT COALESCE(JSONB_AGG(champion_id ORDER BY champion_id COLLATE "C"), '[]'::JSONB)
      INTO v_owned FROM public.account_champion_unlocks WHERE user_id = v_user;
    SELECT COALESCE(JSONB_AGG(champion_id ORDER BY champion_id COLLATE "C"), '[]'::JSONB)
      INTO v_first_wins FROM public.shard_transactions
      WHERE user_id = v_user AND rotation_id = v_rotation_id AND reason = 'rotation_first_win';
  END IF;
  RETURN JSONB_BUILD_OBJECT('enabled', v_config.enabled, 'economyVersion', v_config.economy_version,
    'catalogVersion', v_config.catalog_version, 'gameplayRulesetVersion', v_config.gameplay_ruleset_version,
    'serverNow', v_now, 'rotation', v_rotation, 'catalog', v_catalog, 'wallet', v_wallet,
    'ownedChampionIds', v_owned, 'firstWinChampionIds', v_first_wins);
END;
$$;
REVOKE ALL ON FUNCTION public.get_champion_economy_snapshot() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_champion_economy_snapshot() TO anon, authenticated;

CREATE FUNCTION public.set_champion_economy_enabled(p_enabled BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_config public.champion_economy_config%ROWTYPE; v_cutoff TIMESTAMPTZ;
BEGIN
  IF (SELECT auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_economy_flag' USING ERRCODE = '22023'; END IF;
  SELECT * INTO STRICT v_config FROM public.champion_economy_config WHERE singleton FOR UPDATE;
  IF p_enabled THEN
    PERFORM public.get_champion_economy_snapshot();
    IF NOT EXISTS (SELECT 1 FROM public.gameplay_rulesets
      WHERE is_active AND version = v_config.gameplay_ruleset_version) THEN
      RAISE EXCEPTION 'champion_catalog_mismatch' USING ERRCODE = '22023';
    END IF;
    IF v_config.activated_at IS NULL THEN
      v_cutoff := CLOCK_TIMESTAMP();
      INSERT INTO public.account_wallets(user_id)
      SELECT id FROM auth.users WHERE NOT COALESCE(is_anonymous, FALSE) ON CONFLICT DO NOTHING;
      INSERT INTO public.account_champion_unlocks(user_id, champion_id, source)
      SELECT account.id, catalog.champion_id, 'legacy_grant'
      FROM auth.users AS account CROSS JOIN public.champion_economy_catalog AS catalog
      WHERE account.created_at < v_cutoff AND NOT COALESCE(account.is_anonymous, FALSE)
        AND catalog.catalog_version = v_config.catalog_version
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  UPDATE public.champion_economy_config SET enabled = p_enabled,
    activated_at = COALESCE(activated_at, v_cutoff), updated_at = CLOCK_TIMESTAMP() WHERE singleton
  RETURNING * INTO v_config;
  RETURN JSONB_BUILD_OBJECT('enabled', v_config.enabled, 'activatedAt', v_config.activated_at,
    'economyVersion', v_config.economy_version, 'catalogVersion', v_config.catalog_version);
END;
$$;
REVOKE ALL ON FUNCTION public.set_champion_economy_enabled(BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_champion_economy_enabled(BOOLEAN) TO service_role;

CREATE FUNCTION private.append_shard_transaction(p_user UUID, p_amount BIGINT, p_reason TEXT,
  p_attempt UUID, p_champion TEXT, p_rotation TEXT, p_key TEXT, p_economy SMALLINT, p_ruleset SMALLINT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_wallet public.account_wallets%ROWTYPE; v_id UUID;
BEGIN
  SELECT * INTO STRICT v_wallet FROM public.account_wallets WHERE user_id = p_user FOR UPDATE;
  SELECT id INTO v_id FROM public.shard_transactions WHERE idempotency_key = p_key;
  IF FOUND THEN RETURN v_id; END IF;
  IF v_wallet.shards_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'insufficient_shards' USING ERRCODE = '22023';
  END IF;
  UPDATE public.account_wallets SET shards_balance = shards_balance + p_amount,
    lifetime_shards_earned = lifetime_shards_earned + GREATEST(p_amount, 0),
    lifetime_shards_spent = lifetime_shards_spent + GREATEST(-p_amount, 0),
    updated_at = CLOCK_TIMESTAMP() WHERE user_id = p_user RETURNING * INTO v_wallet;
  INSERT INTO public.shard_transactions(user_id, amount, balance_after, reason, run_attempt_id,
    champion_id, rotation_id, economy_version, gameplay_ruleset_version, idempotency_key)
  VALUES (p_user, p_amount, v_wallet.shards_balance, p_reason, p_attempt, p_champion,
    p_rotation, p_economy, p_ruleset, p_key) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION private.append_shard_transaction(UUID, BIGINT, TEXT, UUID, TEXT, TEXT, TEXT, SMALLINT, SMALLINT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.purchase_champion(p_command_id UUID, p_champion_id TEXT,
  p_expected_price BIGINT, p_expected_catalog_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user UUID := private.champion_economy_account_id();
  v_config public.champion_economy_config%ROWTYPE;
  v_catalog public.champion_economy_catalog%ROWTYPE;
  v_wallet public.account_wallets%ROWTYPE;
  v_command public.champion_purchase_commands%ROWTYPE;
  v_hash TEXT;
  v_transaction UUID;
BEGIN
  IF v_user IS NULL THEN RAISE LOG '[champion_economy] purchase_refused reason=authentication_required'; RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  IF p_command_id IS NULL OR p_champion_id IS NULL OR p_expected_price IS NULL OR p_expected_catalog_version IS NULL THEN
    RAISE LOG '[champion_economy] purchase_refused reason=invalid_purchase_command'; RAISE EXCEPTION 'invalid_purchase_command' USING ERRCODE = '22023';
  END IF;
  v_hash := ENCODE(extensions.digest(CONVERT_TO(JSONB_BUILD_OBJECT('championId', p_champion_id,
    'price', p_expected_price, 'catalogVersion', p_expected_catalog_version)::TEXT, 'UTF8'), 'sha256'), 'hex');
  SELECT * INTO STRICT v_config FROM public.champion_economy_config WHERE singleton FOR SHARE;
  SELECT * INTO STRICT v_wallet FROM public.account_wallets WHERE user_id = v_user FOR UPDATE;
  SELECT * INTO v_command FROM public.champion_purchase_commands WHERE user_id = v_user AND command_id = p_command_id;
  IF FOUND THEN
    IF v_command.payload_hash <> v_hash THEN
      RAISE LOG '[champion_economy] purchase_refused reason=idempotency_key_reused'; RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_BUILD_OBJECT('replayed', TRUE, 'snapshot', public.get_champion_economy_snapshot());
  END IF;
  IF NOT v_config.enabled THEN RAISE LOG '[champion_economy] purchase_refused reason=champion_economy_disabled'; RAISE EXCEPTION 'champion_economy_disabled' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_catalog FROM public.champion_economy_catalog
    WHERE catalog_version = v_config.catalog_version AND champion_id = p_champion_id;
  IF NOT FOUND THEN RAISE LOG '[champion_economy] purchase_refused reason=invalid_champion'; RAISE EXCEPTION 'invalid_champion' USING ERRCODE = '22023'; END IF;
  IF v_catalog.permanent_free THEN RAISE LOG '[champion_economy] purchase_refused reason=champion_not_purchasable'; RAISE EXCEPTION 'champion_not_purchasable' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.account_champion_unlocks WHERE user_id = v_user AND champion_id = p_champion_id) THEN
    RAISE LOG '[champion_economy] purchase_refused reason=champion_already_owned'; RAISE EXCEPTION 'champion_already_owned' USING ERRCODE = '23505';
  END IF;
  IF p_expected_catalog_version <> v_config.catalog_version OR p_expected_price <> v_catalog.price_shards THEN
    RAISE LOG '[champion_economy] purchase_refused reason=champion_price_changed'; RAISE EXCEPTION 'champion_price_changed' USING ERRCODE = '22023';
  END IF;
  IF v_wallet.shards_balance < v_catalog.price_shards THEN
    RAISE LOG '[champion_economy] purchase_refused reason=insufficient_shards'; RAISE EXCEPTION 'insufficient_shards' USING ERRCODE = '22023';
  END IF;
  v_transaction := private.append_shard_transaction(v_user, -v_catalog.price_shards, 'champion_purchase',
    NULL, p_champion_id, NULL, 'purchase:' || v_user::TEXT || ':' || p_command_id::TEXT,
    v_config.economy_version, v_config.gameplay_ruleset_version);
  INSERT INTO public.account_champion_unlocks(user_id, champion_id, source, price_paid, transaction_id)
  VALUES (v_user, p_champion_id, 'purchase', v_catalog.price_shards, v_transaction);
  INSERT INTO public.champion_purchase_commands(user_id, command_id, payload_hash, transaction_id)
  VALUES (v_user, p_command_id, v_hash, v_transaction);
  RETURN JSONB_BUILD_OBJECT('replayed', FALSE, 'snapshot', public.get_champion_economy_snapshot());
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_champion(UUID, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purchase_champion(UUID, TEXT, BIGINT, INTEGER) TO authenticated;

-- Maintenance adjustments append an auditable entry instead of editing history.
CREATE FUNCTION public.adjust_champion_shards(p_user_id UUID, p_amount BIGINT, p_command_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction public.shard_transactions%ROWTYPE; v_config public.champion_economy_config%ROWTYPE; v_key TEXT; v_id UUID;
BEGIN
  IF (SELECT auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_command_id IS NULL OR p_amount IS NULL OR p_amount = 0 OR ABS(p_amount::NUMERIC) > 1000000 THEN
    RAISE EXCEPTION 'invalid_shard_adjustment' USING ERRCODE = '22023';
  END IF;
  v_key := 'admin_adjustment:' || p_user_id::TEXT || ':' || p_command_id::TEXT;
  PERFORM 1 FROM public.account_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_transaction FROM public.shard_transactions WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_transaction.amount <> p_amount THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023'; END IF;
    RETURN JSONB_BUILD_OBJECT('transactionId', v_transaction.id, 'replayed', TRUE);
  END IF;
  SELECT * INTO STRICT v_config FROM public.champion_economy_config WHERE singleton;
  v_id := private.append_shard_transaction(p_user_id, p_amount, 'admin_adjustment', NULL, NULL, NULL,
    v_key, v_config.economy_version, v_config.gameplay_ruleset_version);
  RETURN JSONB_BUILD_OBJECT('transactionId', v_id, 'replayed', FALSE);
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_champion_shards(UUID, BIGINT, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_champion_shards(UUID, BIGINT, UUID) TO service_role;

ALTER TABLE public.run_attempts ADD COLUMN champion_access_snapshot JSONB,
  ADD COLUMN economy_version SMALLINT CHECK (economy_version IS NULL OR economy_version = 1),
  ADD COLUMN shard_reward_context JSONB;

CREATE FUNCTION public.audit_champion_economy()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH ledger AS (
    SELECT user_id, SUM(amount) AS balance, SUM(GREATEST(amount, 0)) AS earned,
      SUM(GREATEST(-amount, 0)) AS spent FROM public.shard_transactions GROUP BY user_id
  ), divergences AS (
    SELECT wallet.user_id FROM public.account_wallets AS wallet LEFT JOIN ledger USING (user_id)
    WHERE wallet.shards_balance <> COALESCE(ledger.balance, 0)
      OR wallet.lifetime_shards_earned <> COALESCE(ledger.earned, 0)
      OR wallet.lifetime_shards_spent <> COALESCE(ledger.spent, 0)
  ), first_purchases AS (
    SELECT transaction.user_id, EXTRACT(EPOCH FROM (MIN(transaction.created_at) - account.created_at)) AS seconds
    FROM public.shard_transactions AS transaction JOIN auth.users AS account ON account.id = transaction.user_id
    WHERE transaction.reason = 'champion_purchase' GROUP BY transaction.user_id, account.created_at
  ), rotation_usage AS (
    SELECT COUNT(*) AS eligible, COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM UNNEST(attempt.initial_team) AS selected(champion_id)
      WHERE attempt.champion_access_snapshot -> 'rotationChampionIds' ? selected.champion_id
    )) AS used FROM public.run_attempts AS attempt WHERE attempt.economy_version = 1
  ), purchase_counts AS (
    SELECT champion_id, COUNT(*) AS purchased FROM public.shard_transactions
    WHERE reason = 'champion_purchase' GROUP BY champion_id
  ), anomalous_rewards AS (
    SELECT transaction.user_id FROM public.shard_transactions AS transaction
    JOIN public.run_attempts AS attempt ON attempt.id = transaction.run_attempt_id
    WHERE transaction.reason IN ('run_reward', 'rotation_first_win') AND (
      attempt.status <> 'verified' OR transaction.gameplay_ruleset_version <> attempt.gameplay_ruleset_version
      OR transaction.economy_version <> attempt.economy_version
      OR (transaction.reason = 'run_reward' AND transaction.amount > 135)
      OR (transaction.reason = 'rotation_first_win' AND transaction.amount <> 50)
    )
  )
  SELECT JSONB_BUILD_OBJECT('dryRun', TRUE, 'consistent', NOT EXISTS (SELECT 1 FROM divergences),
    'divergentWalletCount', (SELECT COUNT(*) FROM divergences),
    'walletCount', COUNT(*), 'shardsEarned', COALESCE(SUM(lifetime_shards_earned), 0),
    'shardsSpent', COALESCE(SUM(lifetime_shards_spent), 0),
    'medianBalance', COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY shards_balance), 0),
    'p95Balance', COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY shards_balance), 0),
    'purchaseCount', (SELECT COUNT(*) FROM public.shard_transactions WHERE reason = 'champion_purchase'),
    'medianSecondsToFirstPurchase', (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds) FROM first_purchases),
    'purchasedChampionCounts', (SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('championId', champion_id,
      'purchaseCount', purchased) ORDER BY champion_id COLLATE "C"), '[]'::JSONB) FROM purchase_counts),
    'rotationAttemptCount', (SELECT used FROM rotation_usage),
    'rotationUseRate', (SELECT CASE WHEN eligible = 0 THEN 0 ELSE used::NUMERIC / eligible END FROM rotation_usage),
    'anomalousRewardCount', (SELECT COUNT(*) FROM anomalous_rewards),
    'anomalousRewardAccountCount', (SELECT COUNT(DISTINCT user_id) FROM anomalous_rewards))
  FROM public.account_wallets
$$;
REVOKE ALL ON FUNCTION public.audit_champion_economy() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_champion_economy() TO service_role;


CREATE FUNCTION private.freeze_champion_access_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_snapshot JSONB; v_allowed JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.champion_access_snapshot IS DISTINCT FROM OLD.champion_access_snapshot
      OR NEW.economy_version IS DISTINCT FROM OLD.economy_version THEN
      RAISE EXCEPTION 'champion_access_snapshot_immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  v_snapshot := public.get_champion_economy_snapshot();
  IF NEW.mode = 'daily' THEN
    v_allowed := TO_JSONB(public.daily_starter_ids(NEW.daily_date, NEW.daily_ruleset_version));
  ELSE
    SELECT JSONB_AGG(champion ->> 'championId' ORDER BY champion ->> 'championId' COLLATE "C")
    INTO v_allowed FROM JSONB_ARRAY_ELEMENTS(v_snapshot -> 'catalog') AS entry(champion)
    WHERE NOT (v_snapshot ->> 'enabled')::BOOLEAN
      OR (champion ->> 'permanentFree')::BOOLEAN
      OR v_snapshot -> 'ownedChampionIds' ? (champion ->> 'championId')
      OR v_snapshot -> 'rotation' -> 'championIds' ? (champion ->> 'championId');
  END IF;
  IF EXISTS (SELECT 1 FROM UNNEST(NEW.initial_team) AS selected(champion_id)
    WHERE NOT COALESCE(v_allowed ? champion_id, FALSE)) THEN
    RAISE EXCEPTION 'champion_access_expired' USING ERRCODE = '22023';
  END IF;
  NEW.economy_version := CASE WHEN (v_snapshot ->> 'enabled')::BOOLEAN
    THEN (v_snapshot ->> 'economyVersion')::SMALLINT ELSE NULL END;
  NEW.champion_access_snapshot := JSONB_BUILD_OBJECT('version', 1,
    'enabled', (v_snapshot ->> 'enabled')::BOOLEAN, 'economyVersion', NEW.economy_version,
    'catalogVersion', (v_snapshot ->> 'catalogVersion')::INTEGER,
    'rotationId', v_snapshot -> 'rotation' ->> 'id',
    'rotationStartsAt', v_snapshot -> 'rotation' -> 'startsAt',
    'rotationEndsAt', v_snapshot -> 'rotation' -> 'endsAt',
    'allowedChampionIds', v_allowed, 'rotationChampionIds', v_snapshot -> 'rotation' -> 'championIds');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.freeze_champion_access_snapshot() FROM PUBLIC, anon, authenticated, service_role;
-- z sorts after the existing Daily normalization and mastery root-hash triggers.
-- Access metadata does not alter the immutable gameplay v21 replay/hash contract.
CREATE TRIGGER run_attempts_z_champion_access BEFORE INSERT OR UPDATE OF champion_access_snapshot, economy_version
  ON public.run_attempts FOR EACH ROW EXECUTE FUNCTION private.freeze_champion_access_snapshot();

ALTER FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT) RENAME TO start_run_attempt_pre_champion_economy;
REVOKE ALL ON FUNCTION public.start_run_attempt_pre_champion_economy(UUID, TEXT[], TEXT[], TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.start_run_attempt(p_command_id UUID, p_team TEXT[], p_rune_ids TEXT[], p_difficulty TEXT, p_mode TEXT DEFAULT 'normal')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_response JSONB; v_attempt public.run_attempts%ROWTYPE;
BEGIN
  v_response := public.start_run_attempt_pre_champion_economy(p_command_id, p_team, p_rune_ids, p_difficulty, p_mode);
  SELECT * INTO STRICT v_attempt FROM public.run_attempts WHERE id = (v_response ->> 'attempt_id')::UUID;
  RETURN v_response || JSONB_BUILD_OBJECT('champion_access_snapshot', v_attempt.champion_access_snapshot,
    'economy_version', v_attempt.economy_version);
END;
$$;
REVOKE ALL ON FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT) TO authenticated;

ALTER FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[]) RENAME TO start_daily_run_attempt_pre_champion_economy;
REVOKE ALL ON FUNCTION public.start_daily_run_attempt_pre_champion_economy(UUID, TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.start_daily_run_attempt(p_command_id UUID, p_team TEXT[], p_rune_ids TEXT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_response JSONB; v_attempt public.run_attempts%ROWTYPE;
BEGIN
  v_response := public.start_daily_run_attempt_pre_champion_economy(p_command_id, p_team, p_rune_ids);
  SELECT * INTO STRICT v_attempt FROM public.run_attempts WHERE id = (v_response ->> 'attempt_id')::UUID;
  RETURN v_response || JSONB_BUILD_OBJECT('champion_access_snapshot', v_attempt.champion_access_snapshot,
    'economy_version', v_attempt.economy_version);
END;
$$;
REVOKE ALL ON FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_daily_run_attempt(UUID, TEXT[], TEXT[]) TO authenticated;

ALTER FUNCTION public.claim_run_verification(UUID, UUID) RENAME TO claim_run_verification_pre_champion_economy;
REVOKE ALL ON FUNCTION public.claim_run_verification_pre_champion_economy(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.claim_run_verification(p_attempt_id UUID, p_worker_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_response JSONB; v_attempt public.run_attempts%ROWTYPE;
BEGIN
  v_response := public.claim_run_verification_pre_champion_economy(p_attempt_id, p_worker_id);
  IF COALESCE((v_response ->> 'claimed')::BOOLEAN, FALSE) THEN
    SELECT * INTO STRICT v_attempt FROM public.run_attempts WHERE id = p_attempt_id;
    v_response := v_response || JSONB_BUILD_OBJECT('champion_access_snapshot', v_attempt.champion_access_snapshot,
      'economy_version', v_attempt.economy_version);
  END IF;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_run_verification(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_run_verification(UUID, UUID) TO service_role;

CREATE FUNCTION private.shard_reward_base_v1(p_waves INTEGER, p_biomes INTEGER, p_won BOOLEAN)
RETURNS BIGINT LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT CASE WHEN p_waves < 1 THEN 0 ELSE 25 + p_biomes::BIGINT * 10 + CASE WHEN p_won THEN 50 ELSE 0 END END
$$;
REVOKE ALL ON FUNCTION private.shard_reward_base_v1(INTEGER, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT) RENAME TO complete_run_verification_pre_champion_economy;
REVOKE ALL ON FUNCTION public.complete_run_verification_pre_champion_economy(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.complete_run_verification(p_attempt_id UUID, p_lease_token UUID, p_result JSONB, p_result_hash TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt public.run_attempts%ROWTYPE;
  v_response JSONB;
  v_context JSONB := p_result -> 'economy';
  v_waves INTEGER;
  v_biomes INTEGER;
  v_won BOOLEAN;
  v_amount BIGINT;
  v_total BIGINT;
  v_balance BIGINT;
  v_champion TEXT;
  v_rotation TEXT;
  v_first_wins JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_attempt FROM public.run_attempts WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_attempt.status = 'verified' AND v_context IS DISTINCT FROM v_attempt.shard_reward_context THEN
    RAISE EXCEPTION 'verified_result_conflict' USING ERRCODE = '22023';
  END IF;
  -- Gameplay v21 canonical result/hash and mastery computation remain untouched.
  v_response := public.complete_run_verification_pre_champion_economy(p_attempt_id, p_lease_token, p_result - 'economy', p_result_hash);
  IF v_attempt.economy_version IS NULL OR (v_response ->> 'status') IS DISTINCT FROM 'verified'
    OR v_attempt.status = 'verified' THEN RETURN v_response; END IF;
  IF JSONB_TYPEOF(v_context) IS DISTINCT FROM 'object' OR v_context ->> 'version' IS DISTINCT FROM '1'
    OR JSONB_TYPEOF(v_context -> 'waves_completed') IS DISTINCT FROM 'number'
    OR JSONB_TYPEOF(v_context -> 'biomes_completed') IS DISTINCT FROM 'number'
    OR EXISTS (SELECT 1 FROM JSONB_OBJECT_KEYS(v_context) AS key(name)
      WHERE name <> ALL (ARRAY['version', 'waves_completed', 'biomes_completed'])) THEN
    RAISE EXCEPTION 'invalid_shard_reward_context' USING ERRCODE = '22023';
  END IF;
  v_waves := public.progression_integer(v_context -> 'waves_completed', 0, 0, 10000, 'economy.waves_completed')::INTEGER;
  v_biomes := public.progression_integer(v_context -> 'biomes_completed', 0, 0, 6, 'economy.biomes_completed')::INTEGER;
  v_won := (p_result ->> 'won')::BOOLEAN;
  IF v_waves <> (p_result ->> 'waves_completed')::INTEGER
    OR v_biomes <> JSONB_ARRAY_LENGTH(p_result -> 'biomes_visited') - 1 + (CASE WHEN v_won THEN 1 ELSE 0 END)
    OR (v_waves = 0 AND (v_biomes <> 0 OR v_won)) THEN
    RAISE EXCEPTION 'invalid_shard_reward_context' USING ERRCODE = '22023';
  END IF;
  SELECT shards_balance INTO STRICT v_balance FROM public.account_wallets WHERE user_id = v_attempt.user_id FOR UPDATE;
  v_amount := private.shard_reward_base_v1(v_waves, v_biomes, v_won);
  v_total := v_amount;
  IF v_amount > 0 THEN
    PERFORM private.append_shard_transaction(v_attempt.user_id, v_amount, 'run_reward', p_attempt_id, NULL, NULL,
      'run_reward:' || p_attempt_id::TEXT, v_attempt.economy_version, v_attempt.gameplay_ruleset_version);
  END IF;
  v_rotation := v_attempt.champion_access_snapshot ->> 'rotationId';
  IF v_won AND v_waves > 0 THEN
    FOR v_champion IN SELECT DISTINCT member ->> 'champion_id'
      FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members') AS item(member)
      WHERE v_attempt.champion_access_snapshot -> 'rotationChampionIds' ? (member ->> 'champion_id')
      ORDER BY member ->> 'champion_id'
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.shard_transactions WHERE user_id = v_attempt.user_id
        AND rotation_id = v_rotation AND champion_id = v_champion AND reason = 'rotation_first_win') THEN
        PERFORM private.append_shard_transaction(v_attempt.user_id, 50, 'rotation_first_win', p_attempt_id, v_champion, v_rotation,
          'rotation_first_win:' || v_attempt.user_id::TEXT || ':' || v_rotation || ':' || v_champion,
          v_attempt.economy_version, v_attempt.gameplay_ruleset_version);
        v_total := v_total + 50;
        v_first_wins := v_first_wins || JSONB_BUILD_ARRAY(v_champion);
      END IF;
    END LOOP;
  END IF;
  SELECT shards_balance INTO STRICT v_balance FROM public.account_wallets WHERE user_id = v_attempt.user_id;
  v_response := v_response || JSONB_BUILD_OBJECT('shards_earned', v_total, 'shards_balance', v_balance,
    'shard_economy_version', v_attempt.economy_version, 'shard_rotation_first_win_champion_ids', v_first_wins);
  UPDATE public.run_attempts SET shard_reward_context = v_context, response = v_response WHERE id = p_attempt_id;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT) TO service_role;

COMMIT;
