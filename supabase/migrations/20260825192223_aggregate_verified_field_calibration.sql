-- Privacy-safe, admin-only field calibration over authority-verified runs.
-- Raw identifiers, seeds, journals, payloads and precise timestamps never leave
-- the RLS-protected source tables. Every published cell has at least 30 runs.

BEGIN;

CREATE INDEX run_attempts_verified_field_dimensions
  ON public.run_attempts (
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    verified_at DESC
  )
  INCLUDE (result_run_id)
  WHERE status = 'verified' AND result_run_id IS NOT NULL;

CREATE VIEW public.admin_verified_field_cohorts
WITH (security_invoker = true, security_barrier = true) AS
WITH eligible_runs AS (
  SELECT
    (attempt.verified_at AT TIME ZONE 'UTC')::DATE AS observed_on,
    attempt.gameplay_ruleset_version,
    attempt.engine_version,
    attempt.gameplay_content_hash,
    attempt.difficulty,
    attempt.mode,
    dimensions.initial_team_size,
    dimensions.initial_composition_hash,
    dimensions.meta_level,
    run.won,
    run.waves_completed,
    CARDINALITY(run.biomes_visited) AS biomes_completed,
    run.gold_earned,
    run.total_gold_spent,
    run.gold_balance,
    CASE
      WHEN NOT run.won AND CARDINALITY(run.biomes_visited) > 0
        THEN run.biomes_visited[CARDINALITY(run.biomes_visited)]
      ELSE NULL
    END AS death_biome
  FROM public.run_attempts AS attempt
  JOIN public.runs AS run
    ON run.id = attempt.result_run_id
    AND run.run_attempt_id = attempt.id
    AND run.progression_source = 'verified'
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::SMALLINT AS initial_team_size,
      ENCODE(
        extensions.digest(
          CONVERT_TO(STRING_AGG(initial.champion_id, CHR(31) ORDER BY initial.champion_id), 'UTF8'),
          'sha256'::TEXT
        ),
        'hex'
      ) AS initial_composition_hash,
      COALESCE(
        MAX(
          CASE
            WHEN JSONB_TYPEOF(attempt.mastery_snapshot -> initial.champion_id) = 'number'
              AND attempt.mastery_snapshot ->> initial.champion_id ~ '^[0-4]$'
              THEN (attempt.mastery_snapshot ->> initial.champion_id)::SMALLINT
            ELSE 0
          END
        ),
        0
      )::SMALLINT AS meta_level
    FROM UNNEST(attempt.initial_team) AS initial(champion_id)
  ) AS dimensions
  WHERE public.is_current_user_admin()
    AND attempt.status = 'verified'
    AND attempt.verified_at IS NOT NULL
    AND attempt.result_run_id IS NOT NULL
),
cohorts AS (
  SELECT
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    COUNT(*)::BIGINT AS sample_size,
    COUNT(*) FILTER (WHERE won)::BIGINT AS wins,
    COUNT(*) FILTER (WHERE NOT won)::BIGINT AS defeats,
    AVG(waves_completed)::DOUBLE PRECISION AS average_waves_completed,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY waves_completed)::DOUBLE PRECISION
      AS median_waves_completed,
    AVG(biomes_completed)::DOUBLE PRECISION AS average_biomes_completed,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY biomes_completed)::DOUBLE PRECISION
      AS median_biomes_completed,
    AVG(gold_earned)::DOUBLE PRECISION AS average_gold_earned,
    AVG(total_gold_spent)::DOUBLE PRECISION AS average_gold_spent,
    AVG(gold_balance)::DOUBLE PRECISION AS average_gold_balance
  FROM eligible_runs
  GROUP BY
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level
),
death_biome_counts AS (
  SELECT
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    death_biome,
    COUNT(*)::BIGINT AS death_count
  FROM eligible_runs
  WHERE death_biome IS NOT NULL
  GROUP BY
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    death_biome
),
death_distributions AS (
  SELECT
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    JSONB_OBJECT_AGG(death_biome, death_count ORDER BY death_biome) AS death_biome_counts
  FROM death_biome_counts
  GROUP BY
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level
)
SELECT
  cohort.observed_on,
  cohort.gameplay_ruleset_version,
  cohort.engine_version,
  cohort.gameplay_content_hash,
  cohort.difficulty,
  cohort.mode,
  cohort.initial_team_size,
  cohort.initial_composition_hash,
  cohort.meta_level,
  cohort.sample_size,
  cohort.wins,
  cohort.defeats,
  stats.win_rate,
  GREATEST(0::DOUBLE PRECISION, stats.wilson_center - stats.wilson_margin)
    AS win_rate_wilson_low,
  LEAST(1::DOUBLE PRECISION, stats.wilson_center + stats.wilson_margin)
    AS win_rate_wilson_high,
  cohort.average_waves_completed,
  cohort.median_waves_completed,
  cohort.average_biomes_completed,
  cohort.median_biomes_completed,
  cohort.average_gold_earned,
  cohort.average_gold_spent,
  cohort.average_gold_balance,
  COALESCE(deaths.death_biome_counts, '{}'::JSONB) AS death_biome_counts
FROM cohorts AS cohort
CROSS JOIN LATERAL (
  SELECT
    probability.win_rate,
    (probability.win_rate + 3.841458820694124 / (2 * cohort.sample_size))
      / (1 + 3.841458820694124 / cohort.sample_size) AS wilson_center,
    1.959963984540054
      * SQRT(
        probability.win_rate * (1 - probability.win_rate) / cohort.sample_size
        + 3.841458820694124 / (4 * cohort.sample_size * cohort.sample_size)
      )
      / (1 + 3.841458820694124 / cohort.sample_size) AS wilson_margin
  FROM (
    SELECT cohort.wins::DOUBLE PRECISION / cohort.sample_size AS win_rate
  ) AS probability
) AS stats
LEFT JOIN death_distributions AS deaths
  USING (
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level
  )
WHERE cohort.sample_size >= 30;

CREATE VIEW public.admin_verified_field_champion_cohorts
WITH (security_invoker = true, security_barrier = true) AS
WITH eligible_champion_runs AS (
  SELECT
    (attempt.verified_at AT TIME ZONE 'UTC')::DATE AS observed_on,
    attempt.gameplay_ruleset_version,
    attempt.engine_version,
    attempt.gameplay_content_hash,
    attempt.difficulty,
    attempt.mode,
    dimensions.initial_team_size,
    dimensions.initial_composition_hash,
    dimensions.meta_level,
    member.champion_id,
    run.won,
    member.final_level,
    member.kills,
    member.deaths,
    member.damage_dealt,
    member.healing_done,
    member.shielding_done
  FROM public.run_attempts AS attempt
  JOIN public.runs AS run
    ON run.id = attempt.result_run_id
    AND run.run_attempt_id = attempt.id
    AND run.progression_source = 'verified'
  JOIN public.run_team_members AS member
    ON member.run_id = run.id
    AND member.champion_id = ANY(attempt.initial_team)
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::SMALLINT AS initial_team_size,
      ENCODE(
        extensions.digest(
          CONVERT_TO(STRING_AGG(initial.champion_id, CHR(31) ORDER BY initial.champion_id), 'UTF8'),
          'sha256'::TEXT
        ),
        'hex'
      ) AS initial_composition_hash,
      COALESCE(
        MAX(
          CASE
            WHEN JSONB_TYPEOF(attempt.mastery_snapshot -> initial.champion_id) = 'number'
              AND attempt.mastery_snapshot ->> initial.champion_id ~ '^[0-4]$'
              THEN (attempt.mastery_snapshot ->> initial.champion_id)::SMALLINT
            ELSE 0
          END
        ),
        0
      )::SMALLINT AS meta_level
    FROM UNNEST(attempt.initial_team) AS initial(champion_id)
  ) AS dimensions
  WHERE public.is_current_user_admin()
    AND attempt.status = 'verified'
    AND attempt.verified_at IS NOT NULL
    AND attempt.result_run_id IS NOT NULL
),
champion_cohorts AS (
  SELECT
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    champion_id,
    COUNT(*)::BIGINT AS sample_size,
    COUNT(*) FILTER (WHERE won)::BIGINT AS wins,
    AVG(final_level)::DOUBLE PRECISION AS average_final_level,
    AVG(kills)::DOUBLE PRECISION AS average_kills,
    AVG(deaths)::DOUBLE PRECISION AS average_deaths,
    AVG(damage_dealt)::DOUBLE PRECISION AS average_damage_dealt,
    AVG(healing_done)::DOUBLE PRECISION AS average_healing_done,
    AVG(shielding_done)::DOUBLE PRECISION AS average_shielding_done
  FROM eligible_champion_runs
  GROUP BY
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    champion_id
)
SELECT
  champion.observed_on,
  champion.gameplay_ruleset_version,
  champion.engine_version,
  champion.gameplay_content_hash,
  champion.difficulty,
  champion.mode,
  champion.initial_team_size,
  champion.initial_composition_hash,
  champion.meta_level,
  champion.champion_id,
  cohort.sample_size AS cohort_sample_size,
  champion.sample_size,
  champion.wins,
  champion.sample_size::DOUBLE PRECISION / cohort.sample_size AS participation_rate,
  stats.win_rate,
  GREATEST(0::DOUBLE PRECISION, stats.wilson_center - stats.wilson_margin)
    AS win_rate_wilson_low,
  LEAST(1::DOUBLE PRECISION, stats.wilson_center + stats.wilson_margin)
    AS win_rate_wilson_high,
  champion.average_final_level,
  champion.average_kills,
  champion.average_deaths,
  champion.average_damage_dealt,
  champion.average_healing_done,
  champion.average_shielding_done
FROM champion_cohorts AS champion
JOIN public.admin_verified_field_cohorts AS cohort
  USING (
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level
  )
CROSS JOIN LATERAL (
  SELECT
    probability.win_rate,
    (probability.win_rate + 3.841458820694124 / (2 * champion.sample_size))
      / (1 + 3.841458820694124 / champion.sample_size) AS wilson_center,
    1.959963984540054
      * SQRT(
        probability.win_rate * (1 - probability.win_rate) / champion.sample_size
        + 3.841458820694124 / (4 * champion.sample_size * champion.sample_size)
      )
      / (1 + 3.841458820694124 / champion.sample_size) AS wilson_margin
  FROM (
    SELECT champion.wins::DOUBLE PRECISION / champion.sample_size AS win_rate
  ) AS probability
) AS stats
WHERE champion.sample_size >= 30;

CREATE VIEW public.admin_verified_field_augment_cohorts
WITH (security_invoker = true, security_barrier = true) AS
WITH eligible_augment_runs AS (
  SELECT
    (attempt.verified_at AT TIME ZONE 'UTC')::DATE AS observed_on,
    attempt.gameplay_ruleset_version,
    attempt.engine_version,
    attempt.gameplay_content_hash,
    attempt.difficulty,
    attempt.mode,
    dimensions.initial_team_size,
    dimensions.initial_composition_hash,
    dimensions.meta_level,
    augment.augment_id,
    run.won,
    run.waves_completed,
    CARDINALITY(run.biomes_visited) AS biomes_completed,
    run.gold_balance
  FROM public.run_attempts AS attempt
  JOIN public.runs AS run
    ON run.id = attempt.result_run_id
    AND run.run_attempt_id = attempt.id
    AND run.progression_source = 'verified'
  CROSS JOIN LATERAL (
    SELECT
      COUNT(*)::SMALLINT AS initial_team_size,
      ENCODE(
        extensions.digest(
          CONVERT_TO(STRING_AGG(initial.champion_id, CHR(31) ORDER BY initial.champion_id), 'UTF8'),
          'sha256'::TEXT
        ),
        'hex'
      ) AS initial_composition_hash,
      COALESCE(
        MAX(
          CASE
            WHEN JSONB_TYPEOF(attempt.mastery_snapshot -> initial.champion_id) = 'number'
              AND attempt.mastery_snapshot ->> initial.champion_id ~ '^[0-4]$'
              THEN (attempt.mastery_snapshot ->> initial.champion_id)::SMALLINT
            ELSE 0
          END
        ),
        0
      )::SMALLINT AS meta_level
    FROM UNNEST(attempt.initial_team) AS initial(champion_id)
  ) AS dimensions
  CROSS JOIN LATERAL (
    SELECT DISTINCT selected.augment_id
    FROM UNNEST(run.augment_ids) AS selected(augment_id)
  ) AS augment
  WHERE public.is_current_user_admin()
    AND attempt.status = 'verified'
    AND attempt.verified_at IS NOT NULL
    AND attempt.result_run_id IS NOT NULL
),
augment_cohorts AS (
  SELECT
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    augment_id,
    COUNT(*)::BIGINT AS sample_size,
    COUNT(*) FILTER (WHERE won)::BIGINT AS wins,
    AVG(waves_completed)::DOUBLE PRECISION AS average_waves_completed,
    AVG(biomes_completed)::DOUBLE PRECISION AS average_biomes_completed,
    AVG(gold_balance)::DOUBLE PRECISION AS average_gold_balance
  FROM eligible_augment_runs
  GROUP BY
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level,
    augment_id
)
SELECT
  augment.observed_on,
  augment.gameplay_ruleset_version,
  augment.engine_version,
  augment.gameplay_content_hash,
  augment.difficulty,
  augment.mode,
  augment.initial_team_size,
  augment.initial_composition_hash,
  augment.meta_level,
  augment.augment_id,
  cohort.sample_size AS cohort_sample_size,
  augment.sample_size,
  augment.wins,
  augment.sample_size::DOUBLE PRECISION / cohort.sample_size AS selection_rate,
  stats.win_rate,
  GREATEST(0::DOUBLE PRECISION, stats.wilson_center - stats.wilson_margin)
    AS win_rate_wilson_low,
  LEAST(1::DOUBLE PRECISION, stats.wilson_center + stats.wilson_margin)
    AS win_rate_wilson_high,
  augment.average_waves_completed,
  augment.average_biomes_completed,
  augment.average_gold_balance
FROM augment_cohorts AS augment
JOIN public.admin_verified_field_cohorts AS cohort
  USING (
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level
  )
CROSS JOIN LATERAL (
  SELECT
    probability.win_rate,
    (probability.win_rate + 3.841458820694124 / (2 * augment.sample_size))
      / (1 + 3.841458820694124 / augment.sample_size) AS wilson_center,
    1.959963984540054
      * SQRT(
        probability.win_rate * (1 - probability.win_rate) / augment.sample_size
        + 3.841458820694124 / (4 * augment.sample_size * augment.sample_size)
      )
      / (1 + 3.841458820694124 / augment.sample_size) AS wilson_margin
  FROM (
    SELECT augment.wins::DOUBLE PRECISION / augment.sample_size AS win_rate
  ) AS probability
) AS stats
WHERE augment.sample_size >= 30;

REVOKE ALL ON TABLE public.admin_verified_field_cohorts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.admin_verified_field_champion_cohorts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.admin_verified_field_augment_cohorts
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.admin_verified_field_cohorts TO authenticated;
GRANT SELECT ON TABLE public.admin_verified_field_champion_cohorts TO authenticated;
GRANT SELECT ON TABLE public.admin_verified_field_augment_cohorts TO authenticated;

COMMENT ON VIEW public.admin_verified_field_cohorts IS
  'Admin-only verified run aggregates; exact authority and cohort dimensions, k >= 30, Wilson 95%; excludes identifiers, seeds, commands, payloads and precise timestamps.';
COMMENT ON VIEW public.admin_verified_field_champion_cohorts IS
  'Admin-only initial-champion conditional aggregates over compatible verified cells with both cohort and champion n >= 30; excludes identifiers and raw run data.';
COMMENT ON VIEW public.admin_verified_field_augment_cohorts IS
  'Admin-only augment conditional aggregates over compatible verified cells with both cohort and augment n >= 30; excludes identifiers and raw run data.';

COMMIT;
