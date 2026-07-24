-- Make progression mutations server-owned.
--
-- This migration intentionally remains append-only. It revokes legacy client
-- writes, installs canonical champion/enhancement catalogs, and replaces the
-- public run/enhancement commands with narrow, idempotent RPCs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Canonical server catalogs
-- ---------------------------------------------------------------------------

CREATE TABLE public.progression_rulesets (
  version SMALLINT PRIMARY KEY CHECK (version > 0),
  code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  base_candies INTEGER NOT NULL CHECK (base_candies >= 0),
  candies_per_wave INTEGER NOT NULL CHECK (candies_per_wave >= 0),
  candies_per_biome INTEGER NOT NULL CHECK (candies_per_biome >= 0),
  victory_bonus INTEGER NOT NULL CHECK (victory_bonus >= 0),
  max_team_size INTEGER NOT NULL CHECK (max_team_size BETWEEN 1 AND 5),
  max_run_level INTEGER NOT NULL CHECK (max_run_level BETWEEN 1 AND 100),
  min_victory_waves INTEGER NOT NULL CHECK (min_victory_waves > 0),
  max_waves_by_biome INTEGER[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    ARRAY_NDIMS(max_waves_by_biome) = 1
    AND CARDINALITY(max_waves_by_biome) = 6
    AND ARRAY_LOWER(max_waves_by_biome, 1) = 1
    AND ARRAY_UPPER(max_waves_by_biome, 1) = 6
    AND ARRAY_POSITION(max_waves_by_biome, NULL) IS NULL
    AND max_waves_by_biome[1] > 0
    AND max_waves_by_biome[2] >= max_waves_by_biome[1]
    AND max_waves_by_biome[3] >= max_waves_by_biome[2]
    AND max_waves_by_biome[4] >= max_waves_by_biome[3]
    AND max_waves_by_biome[5] >= max_waves_by_biome[4]
    AND max_waves_by_biome[6] >= max_waves_by_biome[5]
    AND min_victory_waves <= max_waves_by_biome[6]
  )
);

CREATE UNIQUE INDEX progression_rulesets_one_active
  ON public.progression_rulesets ((is_active))
  WHERE is_active;

INSERT INTO public.progression_rulesets (
  version,
  code,
  is_active,
  base_candies,
  candies_per_wave,
  candies_per_biome,
  victory_bonus,
  max_team_size,
  max_run_level,
  min_victory_waves,
  max_waves_by_biome
)
VALUES (
  1,
  '2026-07-authoritative-v1',
  TRUE,
  10,
  1,
  2,
  5,
  5,
  2,
  7,
  ARRAY[7, 16, 22, 29, 34, 38]
);

CREATE TABLE public.progression_champion_catalog (
  ruleset_version SMALLINT NOT NULL DEFAULT 1
    REFERENCES public.progression_rulesets(version),
  champion_id TEXT NOT NULL,
  primary_role TEXT NOT NULL CHECK (
    primary_role IN ('assassin', 'fighter', 'mage', 'marksman', 'support', 'tank')
  ),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ruleset_version, champion_id)
);

CREATE TABLE public.enhancement_node_catalog (
  ruleset_version SMALLINT NOT NULL DEFAULT 1
    REFERENCES public.progression_rulesets(version),
  node_id TEXT NOT NULL,
  champion_role TEXT NOT NULL CHECK (
    champion_role IN ('assassin', 'fighter', 'mage', 'marksman', 'support', 'tank')
  ),
  candy_cost INTEGER NOT NULL CHECK (candy_cost > 0),
  max_rank INTEGER NOT NULL DEFAULT 1 CHECK (max_rank > 0),
  required_mastery_level INTEGER NOT NULL DEFAULT 0 CHECK (
    required_mastery_level BETWEEN 0 AND 4
  ),
  prerequisite_node_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ruleset_version, node_id)
);

CREATE TABLE public.progression_commands (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command_id UUID NOT NULL,
  command_type TEXT NOT NULL CHECK (command_type IN ('enhancement_unlock')),
  ruleset_version SMALLINT NOT NULL REFERENCES public.progression_rulesets(version),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, command_id)
);

ALTER TABLE public.progression_champion_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enhancement_node_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_rulesets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Progression rulesets read"
  ON public.progression_rulesets FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Progression champion catalog read"
  ON public.progression_champion_catalog FOR SELECT TO authenticated
  USING (active);

CREATE POLICY "Enhancement node catalog read"
  ON public.enhancement_node_catalog FOR SELECT TO authenticated
  USING (active);

INSERT INTO public.progression_champion_catalog (champion_id, primary_role)
VALUES
  ('Aatrox', 'fighter'),
  ('Ahri', 'mage'),
  ('Akali', 'assassin'),
  ('Akshan', 'marksman'),
  ('Alistar', 'tank'),
  ('Ambessa', 'fighter'),
  ('Amumu', 'tank'),
  ('Anivia', 'mage'),
  ('Annie', 'mage'),
  ('Aphelios', 'marksman'),
  ('Ashe', 'marksman'),
  ('AurelionSol', 'mage'),
  ('Aurora', 'mage'),
  ('Azir', 'mage'),
  ('Bard', 'support'),
  ('Belveth', 'fighter'),
  ('Blitzcrank', 'tank'),
  ('Brand', 'mage'),
  ('Braum', 'tank'),
  ('Briar', 'fighter'),
  ('Caitlyn', 'marksman'),
  ('Camille', 'fighter'),
  ('Cassiopeia', 'mage'),
  ('Chogath', 'tank'),
  ('Corki', 'marksman'),
  ('Darius', 'fighter'),
  ('Diana', 'fighter'),
  ('DrMundo', 'tank'),
  ('Draven', 'marksman'),
  ('Ekko', 'assassin'),
  ('Elise', 'assassin'),
  ('Evelynn', 'assassin'),
  ('Ezreal', 'marksman'),
  ('Fiddlesticks', 'mage'),
  ('Fiora', 'fighter'),
  ('Fizz', 'assassin'),
  ('Galio', 'tank'),
  ('Gangplank', 'fighter'),
  ('Garen', 'fighter'),
  ('Gnar', 'fighter'),
  ('Gragas', 'fighter'),
  ('Graves', 'marksman'),
  ('Gwen', 'fighter'),
  ('Hecarim', 'fighter'),
  ('Heimerdinger', 'mage'),
  ('Hwei', 'mage'),
  ('Illaoi', 'fighter'),
  ('Irelia', 'fighter'),
  ('Ivern', 'support'),
  ('Janna', 'support'),
  ('JarvanIV', 'fighter'),
  ('Jax', 'fighter'),
  ('Jayce', 'fighter'),
  ('Jhin', 'marksman'),
  ('Jinx', 'marksman'),
  ('KSante', 'tank'),
  ('Kaisa', 'marksman'),
  ('Kalista', 'marksman'),
  ('Karma', 'mage'),
  ('Karthus', 'mage'),
  ('Kassadin', 'assassin'),
  ('Katarina', 'assassin'),
  ('Kayle', 'mage'),
  ('Kayn', 'fighter'),
  ('Kennen', 'mage'),
  ('Khazix', 'assassin'),
  ('Kindred', 'marksman'),
  ('Kled', 'fighter'),
  ('KogMaw', 'marksman'),
  ('Leblanc', 'assassin'),
  ('LeeSin', 'fighter'),
  ('Leona', 'tank'),
  ('Lillia', 'fighter'),
  ('Lissandra', 'mage'),
  ('Lucian', 'marksman'),
  ('Lulu', 'support'),
  ('Lux', 'mage'),
  ('MasterYi', 'fighter'),
  ('Malphite', 'tank'),
  ('Malzahar', 'mage'),
  ('Maokai', 'tank'),
  ('Mel', 'mage'),
  ('Milio', 'support'),
  ('MissFortune', 'marksman'),
  ('Mordekaiser', 'fighter'),
  ('Morgana', 'support'),
  ('Naafiri', 'assassin'),
  ('Nami', 'support'),
  ('Nasus', 'fighter'),
  ('Nautilus', 'tank'),
  ('Neeko', 'mage'),
  ('Nidalee', 'assassin'),
  ('Nilah', 'fighter'),
  ('Nocturne', 'fighter'),
  ('Nunu', 'tank'),
  ('Olaf', 'fighter'),
  ('Orianna', 'mage'),
  ('Ornn', 'tank'),
  ('Pantheon', 'fighter'),
  ('Poppy', 'tank'),
  ('Pyke', 'support'),
  ('Qiyana', 'assassin'),
  ('Quinn', 'marksman'),
  ('Rakan', 'support'),
  ('Rammus', 'tank'),
  ('RekSai', 'fighter'),
  ('Rell', 'tank'),
  ('Renata', 'support'),
  ('Renekton', 'fighter'),
  ('Rengar', 'assassin'),
  ('Riven', 'fighter'),
  ('Rumble', 'fighter'),
  ('Ryze', 'mage'),
  ('Samira', 'marksman'),
  ('Sejuani', 'tank'),
  ('Senna', 'support'),
  ('Seraphine', 'support'),
  ('Sett', 'fighter'),
  ('Shaco', 'assassin'),
  ('Shen', 'tank'),
  ('Shyvana', 'fighter'),
  ('Singed', 'tank'),
  ('Sion', 'tank'),
  ('Sivir', 'marksman'),
  ('Skarner', 'tank'),
  ('Smolder', 'marksman'),
  ('Sona', 'support'),
  ('Soraka', 'support'),
  ('Swain', 'mage'),
  ('Sylas', 'mage'),
  ('Syndra', 'mage'),
  ('TahmKench', 'tank'),
  ('Taliyah', 'mage'),
  ('Talon', 'assassin'),
  ('Taric', 'support'),
  ('Teemo', 'marksman'),
  ('Thresh', 'support'),
  ('Tristana', 'marksman'),
  ('Trundle', 'fighter'),
  ('Tryndamere', 'fighter'),
  ('TwistedFate', 'mage'),
  ('Twitch', 'marksman'),
  ('Udyr', 'fighter'),
  ('Urgot', 'fighter'),
  ('Varus', 'marksman'),
  ('Vayne', 'marksman'),
  ('Veigar', 'mage'),
  ('Velkoz', 'mage'),
  ('Vex', 'mage'),
  ('Vi', 'fighter'),
  ('Viego', 'fighter'),
  ('Viktor', 'mage'),
  ('Vladimir', 'mage'),
  ('Volibear', 'fighter'),
  ('Warwick', 'fighter'),
  ('MonkeyKing', 'fighter'),
  ('Xayah', 'marksman'),
  ('Xerath', 'mage'),
  ('XinZhao', 'fighter'),
  ('Yasuo', 'fighter'),
  ('Yone', 'fighter'),
  ('Yorick', 'fighter'),
  ('Yunara', 'marksman'),
  ('Yuumi', 'support'),
  ('Zaahen', 'fighter'),
  ('Zac', 'tank'),
  ('Zed', 'assassin'),
  ('Zeri', 'marksman'),
  ('Ziggs', 'mage'),
  ('Zilean', 'support'),
  ('Zoe', 'mage'),
  ('Zyra', 'mage');

INSERT INTO public.enhancement_node_catalog (
  node_id,
  champion_role,
  candy_cost,
  max_rank,
  required_mastery_level,
  prerequisite_node_ids
)
VALUES
  ('assassin_core_1', 'assassin', 20, 1, 0, ARRAY[]::TEXT[]),
  ('assassin_core_2', 'assassin', 30, 1, 1, ARRAY['assassin_core_1']::TEXT[]),
  ('assassin_core_3', 'assassin', 40, 1, 2, ARRAY['assassin_core_2']::TEXT[]),
  ('assassin_burst_1', 'assassin', 50, 1, 1, ARRAY[]::TEXT[]),
  ('assassin_burst_2', 'assassin', 80, 1, 2, ARRAY['assassin_burst_1']::TEXT[]),
  ('assassin_burst_3', 'assassin', 150, 1, 3, ARRAY['assassin_burst_2']::TEXT[]),
  ('assassin_mobility_1', 'assassin', 50, 1, 1, ARRAY[]::TEXT[]),
  ('assassin_mobility_2', 'assassin', 80, 1, 2, ARRAY['assassin_mobility_1']::TEXT[]),
  ('assassin_mobility_3', 'assassin', 150, 1, 3, ARRAY['assassin_mobility_2']::TEXT[]),
  ('assassin_sustain_1', 'assassin', 50, 1, 1, ARRAY[]::TEXT[]),
  ('assassin_sustain_2', 'assassin', 80, 1, 2, ARRAY['assassin_sustain_1']::TEXT[]),
  ('assassin_sustain_3', 'assassin', 150, 1, 3, ARRAY['assassin_sustain_2']::TEXT[]),
  ('tank_core_1', 'tank', 20, 1, 0, ARRAY[]::TEXT[]),
  ('tank_core_2', 'tank', 30, 1, 1, ARRAY['tank_core_1']::TEXT[]),
  ('tank_core_3', 'tank', 40, 1, 2, ARRAY['tank_core_2']::TEXT[]),
  ('tank_defense_1', 'tank', 50, 1, 1, ARRAY[]::TEXT[]),
  ('tank_defense_2', 'tank', 80, 1, 2, ARRAY['tank_defense_1']::TEXT[]),
  ('tank_defense_3', 'tank', 200, 1, 3, ARRAY['tank_defense_2']::TEXT[]),
  ('tank_support_1', 'tank', 50, 1, 1, ARRAY[]::TEXT[]),
  ('tank_support_2', 'tank', 80, 1, 2, ARRAY['tank_support_1']::TEXT[]),
  ('tank_support_3', 'tank', 200, 1, 3, ARRAY['tank_support_2']::TEXT[]),
  ('tank_thorn_1', 'tank', 50, 1, 1, ARRAY[]::TEXT[]),
  ('tank_thorn_2', 'tank', 80, 1, 2, ARRAY['tank_thorn_1']::TEXT[]),
  ('tank_thorn_3', 'tank', 200, 1, 3, ARRAY['tank_thorn_2']::TEXT[]),
  ('mage_core_1', 'mage', 20, 1, 0, ARRAY[]::TEXT[]),
  ('mage_core_2', 'mage', 30, 1, 1, ARRAY['mage_core_1']::TEXT[]),
  ('mage_core_3', 'mage', 40, 1, 2, ARRAY['mage_core_2']::TEXT[]),
  ('mage_burst_1', 'mage', 50, 1, 1, ARRAY[]::TEXT[]),
  ('mage_burst_2', 'mage', 80, 1, 2, ARRAY['mage_burst_1']::TEXT[]),
  ('mage_burst_3', 'mage', 150, 1, 3, ARRAY['mage_burst_2']::TEXT[]),
  ('mage_control_1', 'mage', 50, 1, 1, ARRAY[]::TEXT[]),
  ('mage_control_2', 'mage', 80, 1, 2, ARRAY['mage_control_1']::TEXT[]),
  ('mage_control_3', 'mage', 150, 1, 3, ARRAY['mage_control_2']::TEXT[]),
  ('mage_sustain_1', 'mage', 50, 1, 1, ARRAY[]::TEXT[]),
  ('mage_sustain_2', 'mage', 80, 1, 2, ARRAY['mage_sustain_1']::TEXT[]),
  ('mage_sustain_3', 'mage', 150, 1, 3, ARRAY['mage_sustain_2']::TEXT[]),
  ('marksman_core_1', 'marksman', 20, 1, 0, ARRAY[]::TEXT[]),
  ('marksman_core_2', 'marksman', 30, 1, 1, ARRAY['marksman_core_1']::TEXT[]),
  ('marksman_core_3', 'marksman', 40, 1, 2, ARRAY['marksman_core_2']::TEXT[]),
  ('marksman_dps_1', 'marksman', 50, 1, 1, ARRAY[]::TEXT[]),
  ('marksman_dps_2', 'marksman', 80, 1, 2, ARRAY['marksman_dps_1']::TEXT[]),
  ('marksman_dps_3', 'marksman', 150, 1, 3, ARRAY['marksman_dps_2']::TEXT[]),
  ('marksman_range_1', 'marksman', 50, 1, 1, ARRAY[]::TEXT[]),
  ('marksman_range_2', 'marksman', 80, 1, 2, ARRAY['marksman_range_1']::TEXT[]),
  ('marksman_range_3', 'marksman', 150, 1, 3, ARRAY['marksman_range_2']::TEXT[]),
  ('marksman_survival_1', 'marksman', 50, 1, 1, ARRAY[]::TEXT[]),
  ('marksman_survival_2', 'marksman', 80, 1, 2, ARRAY['marksman_survival_1']::TEXT[]),
  ('marksman_survival_3', 'marksman', 150, 1, 3, ARRAY['marksman_survival_2']::TEXT[]),
  ('fighter_core_1', 'fighter', 20, 1, 0, ARRAY[]::TEXT[]),
  ('fighter_core_2', 'fighter', 30, 1, 1, ARRAY['fighter_core_1']::TEXT[]),
  ('fighter_core_3', 'fighter', 40, 1, 2, ARRAY['fighter_core_2']::TEXT[]),
  ('fighter_bruiser_1', 'fighter', 50, 1, 1, ARRAY[]::TEXT[]),
  ('fighter_bruiser_2', 'fighter', 80, 1, 2, ARRAY['fighter_bruiser_1']::TEXT[]),
  ('fighter_bruiser_3', 'fighter', 150, 1, 3, ARRAY['fighter_bruiser_2']::TEXT[]),
  ('fighter_duelist_1', 'fighter', 50, 1, 1, ARRAY[]::TEXT[]),
  ('fighter_duelist_2', 'fighter', 80, 1, 2, ARRAY['fighter_duelist_1']::TEXT[]),
  ('fighter_duelist_3', 'fighter', 150, 1, 3, ARRAY['fighter_duelist_2']::TEXT[]),
  ('fighter_sustain_1', 'fighter', 50, 1, 1, ARRAY[]::TEXT[]),
  ('fighter_sustain_2', 'fighter', 80, 1, 2, ARRAY['fighter_sustain_1']::TEXT[]),
  ('fighter_sustain_3', 'fighter', 150, 1, 3, ARRAY['fighter_sustain_2']::TEXT[]),
  ('support_core_1', 'support', 20, 1, 0, ARRAY[]::TEXT[]),
  ('support_core_2', 'support', 30, 1, 1, ARRAY['support_core_1']::TEXT[]),
  ('support_core_3', 'support', 40, 1, 2, ARRAY['support_core_2']::TEXT[]),
  ('support_enchanter_1', 'support', 50, 1, 1, ARRAY[]::TEXT[]),
  ('support_enchanter_2', 'support', 80, 1, 2, ARRAY['support_enchanter_1']::TEXT[]),
  ('support_enchanter_3', 'support', 150, 1, 3, ARRAY['support_enchanter_2']::TEXT[]),
  ('support_tanky_1', 'support', 50, 1, 1, ARRAY[]::TEXT[]),
  ('support_tanky_2', 'support', 80, 1, 2, ARRAY['support_tanky_1']::TEXT[]),
  ('support_tanky_3', 'support', 200, 1, 3, ARRAY['support_tanky_2']::TEXT[]),
  ('support_utility_1', 'support', 50, 1, 1, ARRAY[]::TEXT[]),
  ('support_utility_2', 'support', 80, 1, 2, ARRAY['support_utility_1']::TEXT[]),
  ('support_utility_3', 'support', 150, 1, 3, ARRAY['support_utility_2']::TEXT[]);

CREATE TRIGGER progression_champion_catalog_set_updated_at
  BEFORE UPDATE ON public.progression_champion_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enhancement_node_catalog_set_updated_at
  BEFORE UPDATE ON public.enhancement_node_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Remove every direct client mutation path for derived progression
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Mastery write own" ON public.champion_mastery;
DROP POLICY IF EXISTS "Unlocks insert own" ON public.player_unlocks;
DROP POLICY IF EXISTS "Runs insert own" ON public.runs;
DROP POLICY IF EXISTS "Run team insert own" ON public.run_team_members;
DROP POLICY IF EXISTS "Enhancements manage own" ON public.champion_enhancements;

CREATE POLICY "Enhancements read own"
  ON public.champion_enhancements FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.players FROM anon, authenticated;
REVOKE UPDATE (
  display_name,
  avatar_url,
  level,
  total_candies,
  total_runs_completed,
  total_wins,
  total_waves_completed,
  last_login_at
) ON TABLE public.players FROM anon, authenticated;
GRANT SELECT ON TABLE public.players TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON TABLE public.players TO authenticated;

REVOKE ALL ON TABLE public.champion_mastery FROM anon, authenticated;
REVOKE ALL ON TABLE public.player_unlocks FROM anon, authenticated;
REVOKE ALL ON TABLE public.runs FROM anon, authenticated;
REVOKE ALL ON TABLE public.run_team_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.champion_enhancements FROM anon, authenticated;

GRANT SELECT ON TABLE public.champion_mastery TO authenticated;
GRANT SELECT ON TABLE public.player_unlocks TO authenticated;
GRANT SELECT ON TABLE public.runs TO authenticated;
GRANT SELECT ON TABLE public.run_team_members TO authenticated;
GRANT SELECT ON TABLE public.champion_enhancements TO authenticated;

REVOKE ALL ON TABLE public.progression_champion_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.enhancement_node_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.progression_commands FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.progression_rulesets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.progression_champion_catalog TO authenticated;
GRANT SELECT ON TABLE public.enhancement_node_catalog TO authenticated;
GRANT SELECT ON TABLE public.progression_rulesets TO authenticated;

GRANT ALL PRIVILEGES ON TABLE public.progression_champion_catalog TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.enhancement_node_catalog TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.progression_commands TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.progression_rulesets TO service_role;

-- Legacy commands remain available only to trusted server jobs during rollout.
REVOKE ALL ON FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_completed_run_integer_payload(JSONB, JSONB, JSONB, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_run_loadout(TEXT, TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_completed_run_integer_payload(JSONB, JSONB, JSONB, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_run_loadout(TEXT, TEXT[], TEXT[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

-- Existing rows predate payload attestation. New RPC writes are versioned and
-- hashed so reusing a run UUID with another payload is rejected.
ALTER TABLE public.runs
  ADD COLUMN progression_version SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN progression_payload_hash TEXT,
  ADD COLUMN progression_source TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE public.runs
  ADD CONSTRAINT runs_progression_payload_hash_format
  CHECK (
    progression_payload_hash IS NULL
    OR progression_payload_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT runs_progression_source_valid
  CHECK (progression_source IN ('legacy', 'client_reported', 'verified'));

-- ---------------------------------------------------------------------------
-- Small validation helper used only by SECURITY DEFINER commands
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.progression_integer(
  p_value JSONB,
  p_default BIGINT,
  p_minimum BIGINT,
  p_maximum BIGINT,
  p_field_name TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_text TEXT;
  v_number NUMERIC;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::JSONB THEN
    RETURN p_default;
  END IF;

  IF jsonb_typeof(p_value) <> 'number' THEN
    RAISE EXCEPTION 'invalid_progression_field:%', p_field_name
      USING ERRCODE = '22023';
  END IF;

  v_text := p_value #>> '{}';
  IF v_text !~ '^-?[0-9]+(?:\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'invalid_progression_field:%', p_field_name
      USING ERRCODE = '22023';
  END IF;

  v_number := ROUND(v_text::NUMERIC);
  IF v_number < p_minimum OR v_number > p_maximum THEN
    RAISE EXCEPTION 'progression_field_out_of_range:%', p_field_name
      USING ERRCODE = '22003';
  END IF;

  RETURN v_number::BIGINT;
END;
$$;

REVOKE ALL ON FUNCTION public.progression_integer(JSONB, BIGINT, BIGINT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.progression_integer(JSONB, BIGINT, BIGINT, BIGINT, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Narrow profile command for server-owned last_login_at
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.touch_player_last_login()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_last_login_at TIMESTAMPTZ;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  UPDATE public.players
  SET last_login_at = NOW()
  WHERE user_id = (SELECT auth.uid())
  RETURNING last_login_at INTO v_last_login_at;

  IF v_last_login_at IS NULL THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_last_login_at;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_player_last_login() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_player_last_login() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Atomic, derived and idempotent run finalization
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.save_completed_run_v2(
  p_run JSONB,
  p_team_members JSONB,
  p_rune_ids TEXT[],
  p_augment_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_ruleset public.progression_rulesets%ROWTYPE;
  v_player_id UUID;
  v_run_id UUID;
  v_existing_player_id UUID;
  v_existing_hash TEXT;
  v_existing_candies INTEGER;
  v_existing_version SMALLINT;
  v_existing_source TEXT;
  v_existing_team_size INTEGER;
  v_replay_candidate BOOLEAN := FALSE;
  v_run_uuid TEXT;
  v_won BOOLEAN;
  v_run_level INTEGER;
  v_waves_completed INTEGER;
  v_gold_earned INTEGER;
  v_seed BIGINT;
  v_started_at TIMESTAMPTZ;
  v_completed_at TIMESTAMPTZ := NOW();
  v_allowed_biomes CONSTANT TEXT[] := ARRAY[
    'top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'
  ];
  v_biomes TEXT[] := ARRAY[]::TEXT[];
  v_runes TEXT[] := COALESCE(p_rune_ids, ARRAY[]::TEXT[]);
  v_augments TEXT[] := COALESCE(p_augment_ids, ARRAY[]::TEXT[]);
  v_team_size INTEGER;
  v_member JSONB;
  v_normalized_members JSONB := '[]'::JSONB;
  v_seen_champions TEXT[] := ARRAY[]::TEXT[];
  v_champion_id TEXT;
  v_final_level INTEGER;
  v_final_hp INTEGER;
  v_kills INTEGER;
  v_damage BIGINT;
  v_items TEXT[];
  v_total_kills BIGINT := 0;
  v_total_damage BIGINT := 0;
  v_survivor_count INTEGER := 0;
  v_raw_candies INTEGER := 0;
  v_candies_per_champion INTEGER := 0;
  v_total_candies INTEGER := 0;
  v_payload_hash TEXT;
  v_run_key TEXT;
  v_member_key TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF p_run IS NULL OR jsonb_typeof(p_run) <> 'object' THEN
    RAISE EXCEPTION 'invalid_run_payload' USING ERRCODE = '22023';
  END IF;
  IF p_team_members IS NULL OR jsonb_typeof(p_team_members) <> 'array' THEN
    RAISE EXCEPTION 'invalid_team_payload' USING ERRCODE = '22023';
  END IF;

  FOR v_run_key IN SELECT jsonb_object_keys(p_run)
  LOOP
    IF v_run_key <> ALL (ARRAY[
      'run_uuid', 'won', 'run_level', 'waves_completed', 'biomes_visited',
      'gold_earned', 'seed', 'started_at'
    ]::TEXT[]) THEN
      RAISE EXCEPTION 'unexpected_run_field:%', v_run_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF jsonb_typeof(p_run -> 'run_uuid') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'invalid_run_uuid' USING ERRCODE = '22023';
  END IF;
  v_run_uuid := BTRIM(COALESCE(p_run ->> 'run_uuid', ''));
  IF v_run_uuid !~ '^[A-Za-z0-9_.:-]{8,100}$' THEN
    RAISE EXCEPTION 'invalid_run_uuid' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_player_id
  FROM public.players
  WHERE user_id = v_user_id
  FOR UPDATE;
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve an existing run before consulting the active ruleset. This keeps
  -- retries stable after a ruleset rotation or catalog deactivation.
  SELECT
    run.id,
    run.player_id,
    run.progression_payload_hash,
    run.progression_version
  INTO
    v_run_id,
    v_existing_player_id,
    v_existing_hash,
    v_existing_version
  FROM public.runs AS run
  WHERE run.run_uuid = v_run_uuid;

  IF FOUND THEN
    IF v_existing_player_id <> v_player_id
      OR v_existing_hash IS NULL
      OR v_existing_version < 1 THEN
      RAISE EXCEPTION 'run_uuid_conflict' USING ERRCODE = '23505';
    END IF;
    v_replay_candidate := TRUE;
    SELECT * INTO v_ruleset
    FROM public.progression_rulesets
    WHERE version = v_existing_version;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'progression_ruleset_not_found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT * INTO v_ruleset
    FROM public.progression_rulesets
    WHERE is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'active_progression_ruleset_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_run ? 'won' AND jsonb_typeof(p_run -> 'won') <> 'boolean' THEN
    RAISE EXCEPTION 'invalid_progression_field:won' USING ERRCODE = '22023';
  END IF;
  v_won := COALESCE((p_run ->> 'won')::BOOLEAN, FALSE);

  v_run_level := public.progression_integer(
    p_run -> 'run_level', 1, 1, v_ruleset.max_run_level, 'run_level'
  )::INTEGER;
  v_waves_completed := public.progression_integer(
    p_run -> 'waves_completed', 0, 0, 60, 'waves_completed'
  )::INTEGER;
  v_gold_earned := public.progression_integer(
    p_run -> 'gold_earned', 0, 0, 1000000, 'gold_earned'
  )::INTEGER;

  IF p_run ? 'seed' AND p_run -> 'seed' <> 'null'::JSONB THEN
    v_seed := public.progression_integer(
      p_run -> 'seed',
      0,
      -9007199254740991,
      9007199254740991,
      'seed'
    );
  END IF;

  IF NOT p_run ? 'started_at'
    OR jsonb_typeof(p_run -> 'started_at') <> 'string' THEN
    RAISE EXCEPTION 'invalid_progression_field:started_at' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_started_at := (p_run ->> 'started_at')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_progression_field:started_at' USING ERRCODE = '22023';
  END;

  IF NOT v_replay_candidate AND (
    v_started_at > v_completed_at + INTERVAL '5 minutes'
    OR v_started_at < v_completed_at - INTERVAL '30 days'
  ) THEN
    RAISE EXCEPTION 'progression_field_out_of_range:started_at' USING ERRCODE = '22003';
  END IF;

  IF p_run ? 'biomes_visited' THEN
    IF jsonb_typeof(p_run -> 'biomes_visited') <> 'array' THEN
      RAISE EXCEPTION 'invalid_progression_field:biomes_visited' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_run -> 'biomes_visited') AS biome(value)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
    ) THEN
      RAISE EXCEPTION 'invalid_progression_field:biomes_visited' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
    INTO v_biomes
    FROM jsonb_array_elements_text(p_run -> 'biomes_visited')
      WITH ORDINALITY AS biome(value, ordinality);
  END IF;

  IF CARDINALITY(v_biomes) > CARDINALITY(v_allowed_biomes) THEN
    RAISE EXCEPTION 'progression_field_out_of_range:biomes_visited'
      USING ERRCODE = '22003';
  END IF;
  IF CARDINALITY(v_biomes) > 0 THEN
    FOR v_index IN 1..CARDINALITY(v_biomes)
    LOOP
      IF v_biomes[v_index] IS DISTINCT FROM v_allowed_biomes[v_index] THEN
        RAISE EXCEPTION 'invalid_biome_path' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF v_won AND (
    CARDINALITY(v_biomes) <> CARDINALITY(v_allowed_biomes)
    OR v_waves_completed < v_ruleset.min_victory_waves
    OR v_run_level <> v_ruleset.max_run_level
  ) THEN
    RAISE EXCEPTION 'invalid_victory_claim' USING ERRCODE = '22023';
  END IF;
  IF NOT v_won AND v_run_level <> 1 THEN
    RAISE EXCEPTION 'invalid_run_level_claim' USING ERRCODE = '22023';
  END IF;
  IF v_waves_completed > 0 AND CARDINALITY(v_biomes) = 0 THEN
    RAISE EXCEPTION 'waves_without_biome' USING ERRCODE = '22023';
  END IF;
  IF CARDINALITY(v_biomes) > 0
    AND v_waves_completed > v_ruleset.max_waves_by_biome[CARDINALITY(v_biomes)] THEN
    RAISE EXCEPTION 'progression_field_out_of_range:waves_completed'
      USING ERRCODE = '22003';
  END IF;
  IF CARDINALITY(v_biomes) > 1
    AND v_waves_completed < CARDINALITY(v_biomes) - 1 THEN
    RAISE EXCEPTION 'invalid_biome_wave_progression' USING ERRCODE = '22023';
  END IF;

  v_team_size := jsonb_array_length(p_team_members);
  IF v_team_size < 1 OR v_team_size > v_ruleset.max_team_size THEN
    RAISE EXCEPTION 'invalid_team_size' USING ERRCODE = '22023';
  END IF;

  IF CARDINALITY(v_runes) > 3 OR CARDINALITY(v_augments) > 20 THEN
    RAISE EXCEPTION 'invalid_loadout_size' USING ERRCODE = '22023';
  END IF;
  IF ARRAY_POSITION(v_runes, NULL) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM UNNEST(v_runes) AS rune_id
      WHERE rune_id !~ '^[A-Za-z0-9_.:-]{1,100}$'
    )
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT rune_id)
      FROM UNNEST(v_runes) AS rune_id
    ) THEN
    RAISE EXCEPTION 'invalid_rune_loadout' USING ERRCODE = '22023';
  END IF;
  IF ARRAY_POSITION(v_augments, NULL) IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM UNNEST(v_augments) AS augment_id
      WHERE augment_id !~ '^[A-Za-z0-9_.:-]{1,100}$'
    )
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT augment_id)
      FROM UNNEST(v_augments) AS augment_id
    ) THEN
    RAISE EXCEPTION 'invalid_augment_loadout' USING ERRCODE = '22023';
  END IF;

  FOR v_member IN SELECT value FROM jsonb_array_elements(p_team_members)
  LOOP
    IF jsonb_typeof(v_member) <> 'object' THEN
      RAISE EXCEPTION 'invalid_team_member' USING ERRCODE = '22023';
    END IF;

    FOR v_member_key IN SELECT jsonb_object_keys(v_member)
    LOOP
      IF v_member_key <> ALL (ARRAY[
        'champion_id', 'final_level', 'final_hp', 'kills',
        'damage_dealt', 'items_collected'
      ]::TEXT[]) THEN
        RAISE EXCEPTION 'unexpected_team_member_field:%', v_member_key
          USING ERRCODE = '22023';
      END IF;
    END LOOP;

    IF jsonb_typeof(v_member -> 'champion_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid_progression_field:champion_id' USING ERRCODE = '22023';
    END IF;
    v_champion_id := BTRIM(COALESCE(v_member ->> 'champion_id', ''));
    IF NOT EXISTS (
      SELECT 1
      FROM public.progression_champion_catalog AS champion
      WHERE champion.ruleset_version = v_ruleset.version
        AND champion.champion_id = v_champion_id
        AND (champion.active OR v_replay_candidate)
    ) THEN
      RAISE EXCEPTION 'unknown_champion:%', v_champion_id USING ERRCODE = '22023';
    END IF;
    IF v_champion_id = ANY(v_seen_champions) THEN
      RAISE EXCEPTION 'duplicate_champion:%', v_champion_id USING ERRCODE = '22023';
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
      IF jsonb_typeof(v_member -> 'items_collected') <> 'array' THEN
        RAISE EXCEPTION 'invalid_progression_field:items_collected'
          USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_member -> 'items_collected') AS item(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
      ) THEN
        RAISE EXCEPTION 'invalid_progression_field:items_collected'
          USING ERRCODE = '22023';
      END IF;
      SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
      INTO v_items
      FROM jsonb_array_elements_text(v_member -> 'items_collected')
        WITH ORDINALITY AS item(value, ordinality);
    ELSE
      v_items := ARRAY[]::TEXT[];
    END IF;

    IF CARDINALITY(v_items) > 20 OR EXISTS (
      SELECT 1 FROM UNNEST(v_items) AS item_id
      WHERE item_id !~ '^[A-Za-z0-9_.:-]{1,100}$'
    ) THEN
      RAISE EXCEPTION 'invalid_items_collected' USING ERRCODE = '22023';
    END IF;

    v_total_kills := v_total_kills + v_kills;
    v_total_damage := v_total_damage + v_damage;
    v_survivor_count := v_survivor_count + CASE WHEN v_final_hp > 0 THEN 1 ELSE 0 END;
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

  IF v_won AND v_survivor_count = 0 THEN
    RAISE EXCEPTION 'invalid_victory_claim' USING ERRCODE = '22023';
  END IF;

  -- Zero-wave runs are recorded for history but never grant progression.
  IF v_waves_completed > 0 THEN
    v_raw_candies :=
      v_ruleset.base_candies
      + v_waves_completed * v_ruleset.candies_per_wave
      + CARDINALITY(v_biomes) * v_ruleset.candies_per_biome
      + CASE WHEN v_won THEN v_ruleset.victory_bonus ELSE 0 END;
    v_candies_per_champion := GREATEST(1, FLOOR(v_raw_candies::NUMERIC / v_team_size)::INTEGER);
    v_total_candies := v_candies_per_champion * v_team_size;
  END IF;

  v_payload_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'version', v_ruleset.version,
          'run_uuid', v_run_uuid,
          'won', v_won,
          'run_level', v_run_level,
          'waves_completed', v_waves_completed,
          'biomes_visited', TO_JSONB(v_biomes),
          'gold_earned', v_gold_earned,
          'seed', v_seed,
          'started_at', v_started_at,
          'team_members', v_normalized_members,
          'rune_ids', TO_JSONB(v_runes),
          'augment_ids', TO_JSONB(v_augments)
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );

  v_run_id := NULL;
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
    progression_source
  )
  VALUES (
    v_player_id,
    v_run_uuid,
    v_won,
    v_run_level,
    v_waves_completed,
    v_biomes,
    v_gold_earned,
    v_total_kills,
    v_total_damage,
    v_total_candies,
    v_seed,
    v_runes,
    v_augments,
    v_started_at,
    v_completed_at,
    v_ruleset.version,
    v_payload_hash,
    'client_reported'
  )
  ON CONFLICT (run_uuid) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT
      run.id,
      run.player_id,
      run.progression_payload_hash,
      run.candies_earned,
      run.progression_version,
      run.progression_source,
      (
        SELECT COUNT(*)::INTEGER
        FROM public.run_team_members AS member
        WHERE member.run_id = run.id
      )
    INTO
      v_run_id,
      v_existing_player_id,
      v_existing_hash,
      v_existing_candies,
      v_existing_version,
      v_existing_source,
      v_existing_team_size
    FROM public.runs AS run
    WHERE run.run_uuid = v_run_uuid;

    IF v_run_id IS NULL OR v_existing_player_id <> v_player_id THEN
      RAISE EXCEPTION 'run_uuid_conflict' USING ERRCODE = '23505';
    END IF;
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;

    RETURN JSONB_BUILD_OBJECT(
      'run_id', v_run_id,
      'replayed', TRUE,
      'candies_earned', v_existing_candies,
      'candies_per_champion', CASE
        WHEN v_existing_team_size > 0 THEN v_existing_candies / v_existing_team_size
        ELSE 0
      END,
      'progression_version', v_existing_version,
      'progression_source', v_existing_source
    );
  END IF;

  FOR v_member IN SELECT value FROM jsonb_array_elements(v_normalized_members)
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
        SELECT jsonb_array_elements_text(v_member -> 'items_collected')
      )
    );
  END LOOP;

  UPDATE public.players
  SET
    total_runs_completed = total_runs_completed + 1,
    total_wins = total_wins + CASE WHEN v_won THEN 1 ELSE 0 END,
    total_waves_completed = total_waves_completed + v_waves_completed,
    total_candies = total_candies + v_total_candies
  WHERE id = v_player_id;

  IF v_candies_per_champion > 0 THEN
    FOR v_member IN SELECT value FROM jsonb_array_elements(v_normalized_members)
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
        v_player_id,
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

  RETURN JSONB_BUILD_OBJECT(
    'run_id', v_run_id,
    'replayed', FALSE,
    'candies_earned', v_total_candies,
    'candies_per_champion', v_candies_per_champion,
    'progression_version', v_ruleset.version,
    'progression_source', 'client_reported'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_completed_run_v2(JSONB, JSONB, TEXT[], TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_completed_run_v2(JSONB, JSONB, TEXT[], TEXT[])
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Canonical and idempotent enhancement purchase
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.unlock_champion_enhancement(
  p_champion_id TEXT,
  p_node_id TEXT,
  p_expected_rank INTEGER,
  p_command_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_ruleset public.progression_rulesets%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_node public.enhancement_node_catalog%ROWTYPE;
  v_enhancement public.champion_enhancements%ROWTYPE;
  v_payload_hash TEXT;
  v_existing_command public.progression_commands%ROWTYPE;
  v_claimed BOOLEAN := FALSE;
  v_current_rank INTEGER := 0;
  v_prerequisite TEXT;
  v_prerequisite_rank INTEGER := 0;
  v_mastery_level INTEGER := 0;
  v_response JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF p_command_id IS NULL
    OR p_expected_rank IS NULL
    OR p_expected_rank < 0
    OR BTRIM(COALESCE(p_champion_id, '')) = ''
    OR BTRIM(COALESCE(p_node_id, '')) = '' THEN
    RAISE EXCEPTION 'invalid_enhancement_request' USING ERRCODE = '22023';
  END IF;

  -- Serialize progression commands for one player before resolving either an
  -- existing command or the active ruleset.
  SELECT * INTO v_player
  FROM public.players
  WHERE user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing_command
  FROM public.progression_commands
  WHERE user_id = v_user_id
    AND command_id = p_command_id;

  IF FOUND THEN
    v_payload_hash := ENCODE(
      extensions.digest(
        CONVERT_TO(
          JSONB_BUILD_OBJECT(
            'ruleset_version', v_existing_command.ruleset_version,
            'champion_id', p_champion_id,
            'node_id', p_node_id,
            'expected_rank', p_expected_rank
          )::TEXT,
          'UTF8'
        ),
        'sha256'::TEXT
      ),
      'hex'
    );

    IF v_existing_command.command_type <> 'enhancement_unlock'
      OR v_existing_command.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    IF v_existing_command.response IS NULL THEN
      RAISE EXCEPTION 'command_in_progress' USING ERRCODE = '55000';
    END IF;

    RETURN JSONB_SET(
      v_existing_command.response,
      '{replayed}',
      'true'::JSONB,
      TRUE
    );
  END IF;

  SELECT * INTO v_ruleset
  FROM public.progression_rulesets
  WHERE is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_progression_ruleset_not_found' USING ERRCODE = 'P0002';
  END IF;

  v_payload_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'ruleset_version', v_ruleset.version,
          'champion_id', p_champion_id,
          'node_id', p_node_id,
          'expected_rank', p_expected_rank
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );

  INSERT INTO public.progression_commands (
    user_id,
    command_id,
    command_type,
    ruleset_version,
    payload_hash
  )
  VALUES (
    v_user_id,
    p_command_id,
    'enhancement_unlock',
    v_ruleset.version,
    v_payload_hash
  )
  ON CONFLICT (user_id, command_id) DO NOTHING
  RETURNING TRUE INTO v_claimed;

  IF NOT COALESCE(v_claimed, FALSE) THEN
    SELECT * INTO v_existing_command
    FROM public.progression_commands
    WHERE user_id = v_user_id
      AND command_id = p_command_id;

    IF v_existing_command.command_type <> 'enhancement_unlock'
      OR v_existing_command.ruleset_version <> v_ruleset.version
      OR v_existing_command.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    IF v_existing_command.response IS NULL THEN
      RAISE EXCEPTION 'command_in_progress' USING ERRCODE = '55000';
    END IF;

    RETURN JSONB_SET(
      v_existing_command.response,
      '{replayed}',
      'true'::JSONB,
      TRUE
    );
  END IF;

  SELECT node.* INTO v_node
  FROM public.enhancement_node_catalog AS node
  JOIN public.progression_champion_catalog AS champion
    ON champion.ruleset_version = node.ruleset_version
    AND champion.primary_role = node.champion_role
  WHERE node.ruleset_version = v_ruleset.version
    AND champion.champion_id = p_champion_id
    AND champion.active
    AND node.node_id = p_node_id
    AND node.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enhancement_not_in_champion_catalog' USING ERRCODE = '22023';
  END IF;

  SELECT public.mastery_level_from_candies(total_candies)
  INTO v_mastery_level
  FROM public.champion_mastery
  WHERE player_id = v_player.id
    AND champion_id = p_champion_id;
  v_mastery_level := COALESCE(v_mastery_level, 0);

  IF v_mastery_level < v_node.required_mastery_level THEN
    RAISE EXCEPTION 'mastery_level_required' USING ERRCODE = '22023';
  END IF;
  IF v_player.total_candies < v_node.candy_cost THEN
    RAISE EXCEPTION 'insufficient_candies' USING ERRCODE = '22003';
  END IF;

  INSERT INTO public.champion_enhancements (user_id, champion_id)
  VALUES (v_user_id, p_champion_id)
  ON CONFLICT (user_id, champion_id) DO NOTHING;

  SELECT * INTO v_enhancement
  FROM public.champion_enhancements
  WHERE user_id = v_user_id
    AND champion_id = p_champion_id
  FOR UPDATE;

  IF jsonb_typeof(v_enhancement.unlocked_nodes -> p_node_id) = 'number' THEN
    v_current_rank := (v_enhancement.unlocked_nodes ->> p_node_id)::INTEGER;
  END IF;
  IF v_current_rank <> p_expected_rank THEN
    -- 40001 asks the Supabase/PostgREST stack to retry the whole transaction
    -- and can turn an expected optimistic-lock rejection into a gateway timeout.
    RAISE EXCEPTION 'enhancement_rank_conflict' USING ERRCODE = '22023';
  END IF;
  IF v_current_rank >= v_node.max_rank THEN
    RAISE EXCEPTION 'enhancement_max_rank' USING ERRCODE = '22023';
  END IF;

  FOREACH v_prerequisite IN ARRAY v_node.prerequisite_node_ids
  LOOP
    v_prerequisite_rank := 0;
    IF jsonb_typeof(v_enhancement.unlocked_nodes -> v_prerequisite) = 'number' THEN
      v_prerequisite_rank :=
        (v_enhancement.unlocked_nodes ->> v_prerequisite)::INTEGER;
    END IF;
    IF v_prerequisite_rank < 1 THEN
      RAISE EXCEPTION 'enhancement_prerequisite_required:%', v_prerequisite
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  UPDATE public.players
  SET total_candies = total_candies - v_node.candy_cost
  WHERE id = v_player.id
    AND total_candies >= v_node.candy_cost
  RETURNING * INTO v_player;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_candies' USING ERRCODE = '22003';
  END IF;

  UPDATE public.champion_enhancements
  SET
    unlocked_nodes = JSONB_SET(
      unlocked_nodes,
      ARRAY[p_node_id],
      TO_JSONB(v_current_rank + 1),
      TRUE
    ),
    total_candies_spent = total_candies_spent + v_node.candy_cost
  WHERE id = v_enhancement.id
  RETURNING * INTO v_enhancement;

  v_response := JSONB_BUILD_OBJECT(
    'command_id', p_command_id,
    'champion_id', p_champion_id,
    'node_id', p_node_id,
    'current_rank', v_current_rank + 1,
    'candy_cost', v_node.candy_cost,
    'max_rank', v_node.max_rank,
    'unlocked_nodes', v_enhancement.unlocked_nodes,
    'total_candies_spent', v_enhancement.total_candies_spent,
    'remaining_candies', v_player.total_candies,
    'catalog_version', v_ruleset.version,
    'replayed', FALSE
  );

  UPDATE public.progression_commands
  SET response = v_response, completed_at = NOW()
  WHERE user_id = v_user_id
    AND command_id = p_command_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)
  TO authenticated, service_role;

COMMIT;
