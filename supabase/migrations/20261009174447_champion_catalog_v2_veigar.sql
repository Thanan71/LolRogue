-- Publish the extended roster without rewriting v1 ownership or rotation history.
BEGIN;

-- Freeze the catalogue used by the original activation before advancing v2.
ALTER TABLE public.champion_economy_config
  ADD COLUMN legacy_catalog_version SMALLINT CHECK (legacy_catalog_version > 0);
UPDATE public.champion_economy_config
SET legacy_catalog_version = catalog_version
WHERE activated_at IS NOT NULL;

INSERT INTO public.champion_economy_catalog
  (catalog_version, champion_id, price_shards, permanent_free)
SELECT 2, champion_id, price_shards, permanent_free
FROM public.champion_economy_catalog WHERE catalog_version = 1
ON CONFLICT (catalog_version, champion_id) DO NOTHING;
INSERT INTO public.champion_economy_catalog
  (catalog_version, champion_id, price_shards, permanent_free)
VALUES (2, 'Veigar', 400, FALSE)
ON CONFLICT (catalog_version, champion_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT champion_id, price_shards, permanent_free
    FROM public.champion_economy_catalog WHERE catalog_version = 1
    EXCEPT
    SELECT champion_id, price_shards, permanent_free
    FROM public.champion_economy_catalog WHERE catalog_version = 2 AND champion_id <> 'Veigar'
  ) OR EXISTS (
    SELECT champion_id, price_shards, permanent_free
    FROM public.champion_economy_catalog WHERE catalog_version = 2 AND champion_id <> 'Veigar'
    EXCEPT
    SELECT champion_id, price_shards, permanent_free
    FROM public.champion_economy_catalog WHERE catalog_version = 1
  ) OR NOT EXISTS (
    SELECT 1 FROM public.champion_economy_catalog
    WHERE catalog_version = 2 AND champion_id = 'Veigar'
      AND price_shards = 400 AND NOT permanent_free
  ) THEN
    RAISE EXCEPTION 'champion_catalog_v2_contract_mismatch';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION private.initialize_champion_economy_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_config public.champion_economy_config%ROWTYPE;
BEGIN
  IF COALESCE(NEW.is_anonymous, FALSE) THEN RETURN NEW; END IF;
  SELECT * INTO v_config FROM public.champion_economy_config WHERE singleton FOR SHARE;
  INSERT INTO public.account_wallets(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  IF v_config.activated_at IS NOT NULL AND NEW.created_at < v_config.activated_at THEN
    INSERT INTO public.account_champion_unlocks(user_id, champion_id, source)
    SELECT NEW.id, champion_id, 'legacy_grant'
    FROM public.champion_economy_catalog WHERE catalog_version = v_config.legacy_catalog_version
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.initialize_champion_economy_account() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.set_champion_economy_enabled(p_enabled BOOLEAN)
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
    activated_at = COALESCE(activated_at, v_cutoff),
    legacy_catalog_version = CASE WHEN v_cutoff IS NOT NULL THEN v_config.catalog_version
      ELSE legacy_catalog_version END, updated_at = CLOCK_TIMESTAMP() WHERE singleton
  RETURNING * INTO v_config;
  RETURN JSONB_BUILD_OBJECT('enabled', v_config.enabled, 'activatedAt', v_config.activated_at,
    'economyVersion', v_config.economy_version, 'catalogVersion', v_config.catalog_version);
END;
$$;
REVOKE ALL ON FUNCTION public.set_champion_economy_enabled(BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_champion_economy_enabled(BOOLEAN) TO service_role;


-- Existing rotation rows, run access snapshots and unlocks remain immutable.
UPDATE public.champion_economy_config
SET catalog_version = 2, gameplay_ruleset_version = 22, updated_at = CLOCK_TIMESTAMP()
WHERE singleton;
UPDATE public.gameplay_rulesets SET is_active = FALSE WHERE is_active;
UPDATE public.gameplay_rulesets SET is_active = TRUE WHERE version = 22;
UPDATE public.daily_challenge_rulesets SET is_active = FALSE WHERE is_active;
UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 22;

COMMIT;
