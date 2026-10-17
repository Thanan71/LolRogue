-- ADM-S1: exact, private-by-policy Candy accounting and explicitly defined metrics.
-- No gameplay identity, historical migration or reward formula is changed.
BEGIN;

-- Take the opening snapshot atomically with installation of the write guards.
LOCK TABLE public.players IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.candy_ledger_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.candy_ledger_settings DEFAULT VALUES;

CREATE TABLE public.candy_accounts (
  player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  opening_balance BIGINT NOT NULL CHECK (opening_balance >= 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history_complete BOOLEAN NOT NULL
);

CREATE TABLE public.candy_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('earned', 'spent', 'refunded', 'unattributed')),
  amount BIGINT NOT NULL CHECK (
    (kind IN ('earned', 'refunded') AND amount > 0)
    OR (kind = 'spent' AND amount < 0)
    OR (kind = 'unattributed' AND amount <> 0)
  ),
  source_key TEXT NOT NULL CHECK (CHAR_LENGTH(source_key) BETWEEN 1 AND 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, source_key)
);

-- An existing balance is an opening balance, never evidence of lifetime earnings.
INSERT INTO public.candy_accounts (player_id, opening_balance, history_complete)
SELECT id, total_candies, FALSE FROM public.players;

ALTER TABLE public.candy_ledger_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candy_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candy_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY candy_settings_admin_read ON public.candy_ledger_settings
  FOR SELECT TO authenticated USING ((SELECT public.is_current_user_admin()));
CREATE POLICY candy_accounts_admin_read ON public.candy_accounts
  FOR SELECT TO authenticated USING ((SELECT public.is_current_user_admin()));
CREATE POLICY candy_transactions_admin_read ON public.candy_transactions
  FOR SELECT TO authenticated USING ((SELECT public.is_current_user_admin()));
REVOKE ALL ON public.candy_ledger_settings, public.candy_accounts, public.candy_transactions
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.candy_ledger_settings, public.candy_accounts, public.candy_transactions
  TO authenticated, service_role;
REVOKE ALL ON SEQUENCE public.candy_transactions_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.preserve_candy_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Preserve the existing account-erasure contract; surviving account history is immutable.
  IF TG_OP = 'DELETE' AND NOT EXISTS (
    SELECT 1 FROM public.players WHERE id = OLD.player_id
  ) THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'candy_accounts' AND TG_OP = 'UPDATE' THEN
    IF NEW.player_id = OLD.player_id AND NEW.opening_balance = OLD.opening_balance
      AND NEW.opened_at = OLD.opened_at
      AND NOT (NOT OLD.history_complete AND NEW.history_complete) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'candy_history_append_only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION private.preserve_candy_history()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER candy_accounts_preserve_history BEFORE UPDATE OR DELETE ON public.candy_accounts
  FOR EACH ROW EXECUTE FUNCTION private.preserve_candy_history();
CREATE TRIGGER candy_transactions_append_only BEFORE UPDATE OR DELETE ON public.candy_transactions
  FOR EACH ROW EXECUTE FUNCTION private.preserve_candy_history();

CREATE FUNCTION private.preserve_candy_settings()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'candy_ledger_settings_immutable' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION private.preserve_candy_settings()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER candy_settings_immutable BEFORE UPDATE OR DELETE ON public.candy_ledger_settings
  FOR EACH ROW EXECUTE FUNCTION private.preserve_candy_settings();

CREATE FUNCTION private.initialize_candy_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.candy_accounts (player_id, opening_balance, history_complete)
  VALUES (NEW.id, NEW.total_candies, NEW.total_candies = 0);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.initialize_candy_account()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER players_initialize_candy_account AFTER INSERT ON public.players
  FOR EACH ROW EXECUTE FUNCTION private.initialize_candy_account();

CREATE FUNCTION private.record_candy_transaction(
  p_player_id UUID, p_kind TEXT, p_amount BIGINT, p_source_key TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing public.candy_transactions%ROWTYPE;
BEGIN
  IF p_amount = 0 THEN RETURN; END IF;
  IF NOT (
    (p_kind = 'earned' AND p_amount > 0 AND p_source_key ~ '^run:[0-9a-f-]{36}$')
    OR (p_kind = 'spent' AND p_amount < 0 AND p_source_key ~ '^purchase:[0-9a-f-]{36}$')
    OR (p_kind = 'refunded' AND p_amount > 0 AND p_source_key ~ '^refund:[0-9a-f-]{36}$')
  ) THEN RAISE EXCEPTION 'invalid_candy_transaction' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.candy_transactions (player_id, kind, amount, source_key)
  VALUES (p_player_id, p_kind, p_amount, p_source_key)
  ON CONFLICT (player_id, source_key) DO NOTHING;
  SELECT * INTO STRICT v_existing FROM public.candy_transactions
  WHERE player_id = p_player_id AND source_key = p_source_key;
  IF v_existing.kind <> p_kind OR v_existing.amount <> p_amount THEN
    RAISE EXCEPTION 'candy_idempotency_key_reused' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.record_candy_transaction(UUID, TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

-- Reconcile the final transaction state, after legacy reward allocation corrections.
-- A direct service/maintenance adjustment remains explicitly unattributed, never earned.
-- No caller-controlled GUC is trusted to classify an amount.
CREATE FUNCTION private.reconcile_candy_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_player_id UUID;
  v_balance BIGINT;
  v_expected BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'players' THEN v_player_id := NEW.id;
  ELSE v_player_id := NEW.player_id; END IF;
  SELECT total_candies INTO v_balance FROM public.players
  WHERE id = v_player_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT account.opening_balance + COALESCE(SUM(tx.amount), 0)
  INTO v_expected FROM public.candy_accounts AS account
  LEFT JOIN public.candy_transactions AS tx ON tx.player_id = account.player_id
  WHERE account.player_id = v_player_id GROUP BY account.opening_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'candy_account_missing' USING ERRCODE = '23503';
  END IF;
  IF v_balance <> v_expected THEN
    INSERT INTO public.candy_transactions (player_id, kind, amount, source_key)
    VALUES (v_player_id, 'unattributed', v_balance - v_expected,
      'unattributed:' || pg_catalog.gen_random_uuid()::TEXT);
    UPDATE public.candy_accounts SET history_complete = FALSE
    WHERE player_id = v_player_id AND history_complete;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.reconcile_candy_balance()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE CONSTRAINT TRIGGER players_candy_reconciliation
  AFTER INSERT OR UPDATE ON public.players
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.reconcile_candy_balance();
CREATE CONSTRAINT TRIGGER transactions_candy_reconciliation
  AFTER INSERT ON public.candy_transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.reconcile_candy_balance();

-- Keep both public signatures and their existing authorization contracts intact.
ALTER FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID) SET SCHEMA private;
ALTER FUNCTION private.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)
  RENAME TO unlock_champion_enhancement_pre_candy_ledger;
REVOKE ALL ON FUNCTION private.unlock_champion_enhancement_pre_candy_ledger(TEXT, TEXT, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.unlock_champion_enhancement(
  p_champion_id TEXT, p_node_id TEXT, p_expected_rank INTEGER, p_command_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_response JSONB;
  v_player_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  SET CONSTRAINTS public.players_candy_reconciliation, public.transactions_candy_reconciliation DEFERRED;
  v_response := private.unlock_champion_enhancement_pre_candy_ledger(
    p_champion_id, p_node_id, p_expected_rank, p_command_id
  );
  IF NOT COALESCE((v_response ->> 'replayed')::BOOLEAN, FALSE) THEN
    SELECT id INTO STRICT v_player_id FROM public.players WHERE user_id = (SELECT auth.uid());
    PERFORM private.record_candy_transaction(v_player_id, 'spent',
      -(v_response ->> 'candy_cost')::BIGINT, 'purchase:' || p_command_id::TEXT);
  END IF;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)
  TO authenticated;

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT) SET SCHEMA private;
ALTER FUNCTION private.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_pre_candy_ledger;
REVOKE ALL ON FUNCTION private.complete_run_verification_pre_candy_ledger(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.complete_run_verification(
  p_attempt_id UUID, p_lease_token UUID, p_result JSONB, p_result_hash TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_before_status TEXT;
  v_response JSONB;
  v_player_id UUID;
  v_amount BIGINT;
BEGIN
  SET CONSTRAINTS public.players_candy_reconciliation, public.transactions_candy_reconciliation DEFERRED;
  SELECT status INTO v_before_status FROM public.run_attempts WHERE id = p_attempt_id;
  v_response := private.complete_run_verification_pre_candy_ledger(
    p_attempt_id, p_lease_token, p_result, p_result_hash
  );
  IF v_before_status IS DISTINCT FROM 'verified' AND v_response ->> 'status' = 'verified' THEN
    SELECT player_id, candies_earned INTO STRICT v_player_id, v_amount
    FROM public.runs WHERE id = (v_response ->> 'run_id')::UUID
      AND run_attempt_id = p_attempt_id AND progression_source = 'verified';
    PERFORM private.record_candy_transaction(v_player_id, 'earned', v_amount,
      'run:' || (v_response ->> 'run_id'));
  END IF;
  RETURN v_response;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT) TO service_role;

-- Internal primitive for a future authorized TREE-07 operation, not a public reset API.
CREATE FUNCTION private.refund_candies(p_player_id UUID, p_amount BIGINT, p_command_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_balance BIGINT;
  v_existing public.candy_transactions%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 2147483647 OR p_command_id IS NULL THEN
    RAISE EXCEPTION 'invalid_candy_refund' USING ERRCODE = '22023';
  END IF;
  SET CONSTRAINTS public.players_candy_reconciliation, public.transactions_candy_reconciliation DEFERRED;
  SELECT total_candies INTO STRICT v_balance FROM public.players WHERE id = p_player_id FOR UPDATE;
  SELECT * INTO v_existing FROM public.candy_transactions
  WHERE player_id = p_player_id AND source_key = 'refund:' || p_command_id::TEXT;
  IF FOUND THEN
    IF v_existing.kind <> 'refunded' OR v_existing.amount <> p_amount THEN
      RAISE EXCEPTION 'candy_idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_BUILD_OBJECT('replayed', TRUE, 'remaining_candies', v_balance);
  END IF;
  UPDATE public.players SET total_candies = total_candies + p_amount WHERE id = p_player_id
  RETURNING total_candies INTO v_balance;
  PERFORM private.record_candy_transaction(p_player_id, 'refunded', p_amount,
    'refund:' || p_command_id::TEXT);
  RETURN JSONB_BUILD_OBJECT('replayed', FALSE, 'remaining_candies', v_balance);
END;
$$;
REVOKE ALL ON FUNCTION private.refund_candies(UUID, BIGINT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.admin_stats
WITH (security_invoker = true, security_barrier = true) AS
WITH transaction_totals AS (
  SELECT player_id, SUM(amount) AS delta,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'earned'), 0) AS earned,
    -COALESCE(SUM(amount) FILTER (WHERE kind = 'spent'), 0) AS spent,
    COALESCE(SUM(amount) FILTER (WHERE kind = 'refunded'), 0) AS refunded
  FROM public.candy_transactions GROUP BY player_id
), candy_totals AS (
  SELECT COALESCE(SUM(player.total_candies), 0) AS balance,
    COALESCE(SUM(tx.earned), 0) AS earned, COALESCE(SUM(tx.spent), 0) AS spent,
    COALESCE(SUM(tx.refunded), 0) AS refunded,
    COUNT(*) FILTER (WHERE account.player_id IS NULL OR NOT account.history_complete) AS incomplete,
    COUNT(*) FILTER (WHERE account.player_id IS NULL OR
      player.total_candies <> account.opening_balance + COALESCE(tx.delta, 0)) AS unreconciled
  FROM public.players AS player
  LEFT JOIN public.candy_accounts AS account ON account.player_id = player.id
  LEFT JOIN transaction_totals AS tx ON tx.player_id = player.id
)
SELECT stats.stat_name, stats.stat_value FROM (
  SELECT 'total_players' AS stat_name, COUNT(*)::TEXT AS stat_value FROM public.players
  UNION ALL SELECT 'total_runs', COUNT(*)::TEXT FROM public.runs
  UNION ALL SELECT 'total_daily_runs', COUNT(*)::TEXT FROM public.daily_runs
  UNION ALL SELECT 'total_wins', COALESCE(SUM(total_wins), 0)::TEXT FROM public.players
  UNION ALL SELECT 'active_today', COUNT(*)::TEXT FROM public.players
    WHERE last_login_at >= (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      AND last_login_at < ((DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC')
  UNION ALL SELECT 'total_candies_balance', balance::TEXT FROM candy_totals
  UNION ALL SELECT 'total_candies_earned',
    CASE WHEN incomplete = 0 AND unreconciled = 0 THEN earned::TEXT ELSE NULL END FROM candy_totals
  UNION ALL SELECT 'total_candies_spent',
    CASE WHEN incomplete = 0 AND unreconciled = 0 THEN spent::TEXT ELSE NULL END FROM candy_totals
  UNION ALL SELECT 'total_candies_refunded',
    CASE WHEN incomplete = 0 AND unreconciled = 0 THEN refunded::TEXT ELSE NULL END FROM candy_totals
  UNION ALL SELECT 'candies_earned_since_ledger', earned::TEXT FROM candy_totals
  UNION ALL SELECT 'candies_spent_since_ledger', spent::TEXT FROM candy_totals
  UNION ALL SELECT 'candies_refunded_since_ledger', refunded::TEXT FROM candy_totals
  UNION ALL SELECT 'candies_history_incomplete_accounts', incomplete::TEXT FROM candy_totals
  UNION ALL SELECT 'candies_unreconciled_accounts', unreconciled::TEXT FROM candy_totals
  UNION ALL SELECT 'candies_ledger_started_at',
    TO_CHAR(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    FROM public.candy_ledger_settings WHERE singleton
) AS stats WHERE public.is_current_user_admin();
REVOKE INSERT, UPDATE, DELETE ON public.admin_stats FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admin_stats TO authenticated;

COMMENT ON TABLE public.candy_accounts IS 'Known opening balances, not earnings. Incomplete history is irreversible while the account exists.';
COMMENT ON TABLE public.candy_transactions IS 'Atomic Candy business events; unattributed balance adjustments are never inferred earnings. Personal rows cascade on account erasure.';
COMMENT ON VIEW public.admin_stats IS 'Live admin-only aggregates. active_today counts server-recorded logins in the current UTC day; Candy lifetime totals are null when history is incomplete or unreconciled.';

NOTIFY pgrst, 'reload schema';
COMMIT;
