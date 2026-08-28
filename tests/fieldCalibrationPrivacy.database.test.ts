import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { calculateWilsonInterval95 } from '@/game/balance/authorityCohortReport';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeDatabase = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260825192223_aggregate_verified_field_calibration.sql',
    import.meta.url,
  ),
  'utf8',
);

interface Account {
  client: SupabaseClient<Database>;
  userId: string;
  playerId: string;
}

interface FieldSeed {
  difficulty: 'easy' | 'hard';
  gameplayRulesetVersion: 16 | 17;
  engineVersion: string;
  gameplayContentHash: string;
  sampleSize: number;
  wins: number;
}

interface SeedRow {
  attemptId: string;
  runId: string;
  runUuid: string;
  cell: FieldSeed;
  index: number;
  won: boolean;
  verified: boolean;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function runLocalSql(sql: string): void {
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const dbPort = config.match(/^\[db\]\s*\nport\s*=\s*(\d+)/m)?.[1];
  if (!projectId || !dbPort) throw new Error('Local Supabase database config is incomplete');

  const args = [
    `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
    '--no-psqlrc',
    '--quiet',
    '--set',
    'ON_ERROR_STOP=1',
  ];
  let result = spawnSync('psql', args, { encoding: 'utf8', input: sql });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
    result = spawnSync(
      'docker',
      [
        'exec',
        '--interactive',
        `supabase_db_${projectId}`,
        'psql',
        '--username',
        'postgres',
        '--dbname',
        'postgres',
        '--no-psqlrc',
        '--quiet',
        '--set',
        'ON_ERROR_STOP=1',
      ],
      { encoding: 'utf8', input: sql },
    );
  }
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(result.stderr || 'Local SQL fixture failed');
  }
}

describe('field calibration migration contract', () => {
  it('publishes only minimized admin aggregates behind verified and k thresholds', () => {
    expect(migrationSql).toContain('WITH (security_invoker = true, security_barrier = true)');
    expect(migrationSql).toContain("attempt.status = 'verified'");
    expect(migrationSql).toContain("run.progression_source = 'verified'");
    expect(migrationSql).toMatch(/WHERE cohort\.sample_size >= 30;/);
    expect(migrationSql).toMatch(/WHERE champion\.sample_size >= 30;/);
    expect(migrationSql).toMatch(/WHERE augment\.sample_size >= 30;/);
    expect(migrationSql).toContain('public.is_current_user_admin()');
    expect(migrationSql).toContain('FROM PUBLIC, anon, authenticated, service_role;');

    const selectedColumns = migrationSql.slice(
      migrationSql.indexOf('CREATE VIEW public.admin_verified_field_cohorts'),
      migrationSql.indexOf('CREATE VIEW public.admin_verified_field_champion_cohorts'),
    );
    for (const forbidden of [
      'attempt.user_id',
      'attempt.player_id',
      'attempt.seed',
      'run.id AS',
      'run.run_uuid',
      'run.run_ledger',
    ]) {
      expect(selectedColumns).not.toContain(forbidden);
    }
    expect(selectedColumns).not.toMatch(/attempt\.result(?:\s+AS|\s*,)/);
    expect(selectedColumns).not.toMatch(/attempt\.response(?:\s+AS|\s*,)/);
  });
});

describeDatabase('field calibration live privacy and isolation', () => {
  const createdUserIds: string[] = [];
  let service: SupabaseClient<Database>;

  beforeAll(() => {
    service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    for (const userId of createdUserIds) await service.auth.admin.deleteUser(userId);
  });

  async function createAccount(prefix: string): Promise<Account> {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `${prefix}-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `${prefix}-${suffix}`.slice(0, 50) } },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Field calibration account has no session');
    }
    createdUserIds.push(signup.data.user.id);
    const player = await service
      .from('players')
      .select('id')
      .eq('user_id', signup.data.user.id)
      .single();
    if (player.error || !player.data) throw player.error ?? new Error('Player profile missing');
    return {
      client,
      userId: signup.data.user.id,
      playerId: player.data.id,
    };
  }

  async function seedFieldRuns(account: Account, cells: readonly FieldSeed[]): Promise<void> {
    const progression = await service
      .from('progression_rulesets')
      .select('version')
      .eq('is_active', true)
      .single();
    if (progression.error || !progression.data) {
      throw progression.error ?? new Error('Active progression ruleset missing');
    }
    const mastery = await service.from('champion_mastery').upsert(
      {
        player_id: account.playerId,
        champion_id: 'Garen',
        mastery_level: 2,
      },
      { onConflict: 'player_id,champion_id' },
    );
    if (mastery.error) throw mastery.error;

    const now = new Date();
    const startedAt = new Date(now.getTime() - 60_000).toISOString();
    const finishedAt = new Date(now.getTime() - 30_000).toISOString();
    const expiresAt = new Date(now.getTime() + 3_600_000).toISOString();
    const rows: SeedRow[] = [];

    for (const cell of cells) {
      for (let index = 0; index < cell.sampleSize; index += 1) {
        rows.push({
          attemptId: randomUUID(),
          runId: randomUUID(),
          runUuid: `attempt_${randomUUID()}`,
          cell,
          index,
          won: index < cell.wins,
          verified: true,
        });
      }
    }
    const unverifiedCell = cells[0]!;
    rows.push({
      attemptId: randomUUID(),
      runId: randomUUID(),
      runUuid: `attempt_${randomUUID()}`,
      cell: unverifiedCell,
      index: unverifiedCell.sampleSize,
      won: true,
      verified: false,
    });

    const attemptsSql = rows
      .map(
        (row) => `(
          ${sqlString(row.attemptId)}::UUID,
          ${sqlString(account.userId)}::UUID,
          ${sqlString(account.playerId)}::UUID,
          ${sqlString(randomUUID())}::UUID,
          ${sqlString('a'.repeat(64))},
          ${sqlString(row.runUuid)},
          'rejected',
          ${progression.data.version},
          ${row.cell.gameplayRulesetVersion},
          ${sqlString(row.cell.engineVersion)},
          2,
          ${sqlString(row.cell.gameplayContentHash)},
          ${row.index + 1 + row.cell.gameplayRulesetVersion * 1_000},
          'normal',
          ${sqlString(row.cell.difficulty)},
          ARRAY['Garen']::TEXT[],
          ARRAY[]::TEXT[],
          '{}'::JSONB,
          ${sqlString(startedAt)}::TIMESTAMPTZ,
          ${sqlString(expiresAt)}::TIMESTAMPTZ,
          ${sqlString('b'.repeat(64))},
          ${sqlString(randomUUID())}::UUID,
          0,
          ${sqlString('c'.repeat(64))},
          ${sqlString(finishedAt)}::TIMESTAMPTZ,
          'field_fixture_pending',
          ${sqlString(finishedAt)}::TIMESTAMPTZ
        )`,
      )
      .join(',\n');
    const runsSql = rows
      .map(
        (row) => `(
          ${sqlString(row.runId)}::UUID,
          ${sqlString(account.playerId)}::UUID,
          ${sqlString(row.runUuid)},
          ${row.won},
          ${row.won ? 4 : 2},
          ${row.won ? 18 : 7},
          ${row.won ? "ARRAY['top_lane','jungle','mid_lane']" : "ARRAY['top_lane']"}::TEXT[],
          ${row.won ? 500 : 200},
          ${row.won ? 350 : 150},
          ${row.won ? 150 : 50},
          ARRAY['iron_skin']::TEXT[],
          'verified',
          ${sqlString(row.attemptId)}::UUID,
          ${sqlString(startedAt)}::TIMESTAMPTZ,
          ${sqlString(finishedAt)}::TIMESTAMPTZ
        )`,
      )
      .join(',\n');
    const membersSql = rows
      .map(
        (row) => `(
          ${sqlString(row.runId)}::UUID,
          'Garen',
          ${row.won ? 9 : 5},
          ${row.won ? 100 : 0},
          ${row.won},
          ${row.won ? 8 : 2},
          ${row.won ? 0 : 1},
          ${row.won ? 10_000 : 3_000},
          ${row.won ? 800 : 200},
          ${row.won ? 400 : 100}
        )`,
      )
      .join(',\n');
    const verifiedMappingsSql = rows
      .filter((row) => row.verified)
      .map((row) => `(${sqlString(row.attemptId)}::UUID, ${sqlString(row.runId)}::UUID)`)
      .join(',\n');
    const unverified = rows.find((row) => !row.verified)!;

    runLocalSql(`
      BEGIN;
      INSERT INTO public.run_attempts (
        id, user_id, player_id, start_command_id, start_payload_hash, run_uuid,
        status, ruleset_version, gameplay_ruleset_version, engine_version,
        command_schema_version, gameplay_content_hash, seed, mode, difficulty,
        initial_team, rune_ids, enhancement_snapshot, started_at, expires_at,
        journal_hash, finish_command_id, sealed_sequence, sealed_journal_hash,
        finished_at, rejection_code, rejected_at
      ) VALUES ${attemptsSql};
      INSERT INTO public.runs (
        id, player_id, run_uuid, won, run_level, waves_completed, biomes_visited,
        gold_earned, total_gold_spent, gold_balance, augment_ids,
        progression_source, run_attempt_id, started_at, completed_at
      ) VALUES ${runsSql};
      INSERT INTO public.run_team_members (
        run_id, champion_id, final_level, final_hp, survived, kills, deaths,
        damage_dealt, healing_done, shielding_done
      ) VALUES ${membersSql};
      UPDATE public.run_attempts AS attempt
      SET
        status = 'verified',
        result_hash = ${sqlString('d'.repeat(64))},
        result = '{}'::JSONB,
        response = '{}'::JSONB,
        result_run_id = mapping.run_id,
        verified_at = ${sqlString(finishedAt)}::TIMESTAMPTZ,
        rejection_code = NULL,
        rejected_at = NULL
      FROM (VALUES ${verifiedMappingsSql}) AS mapping(attempt_id, run_id)
      WHERE attempt.id = mapping.attempt_id;
      UPDATE public.run_attempts
      SET result_run_id = ${sqlString(unverified.runId)}::UUID
      WHERE id = ${sqlString(unverified.attemptId)}::UUID;
      COMMIT;
    `);
  }

  it('isolates rulesets, hides sub-k and unverified cells, and denies non-admin reads', async () => {
    const administrator = await createAccount('field-admin');
    const owner = await createAccount('field-owner');
    const promoted = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promoted.error).toBeNull();

    await seedFieldRuns(owner, [
      {
        difficulty: 'easy',
        gameplayRulesetVersion: 17,
        engineVersion: 'run-engine-v17',
        gameplayContentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
        sampleSize: 30,
        wins: 12,
      },
      {
        difficulty: 'easy',
        gameplayRulesetVersion: 16,
        engineVersion: 'run-engine-v16',
        gameplayContentHash: '557f57f06c3410209a4f822d22a97b7699da3cb0278bcba553281a5c2a41dee9',
        sampleSize: 30,
        wins: 24,
      },
      {
        difficulty: 'hard',
        gameplayRulesetVersion: 17,
        engineVersion: 'run-engine-v17',
        gameplayContentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
        sampleSize: 29,
        wins: 0,
      },
    ]);

    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [anonymousRead, serviceRead, ownerRead, adminRead, champions, augments] =
      await Promise.all([
        anonymous.from('admin_verified_field_cohorts').select('*'),
        service.from('admin_verified_field_cohorts').select('*'),
        owner.client.from('admin_verified_field_cohorts').select('*'),
        administrator.client
          .from('admin_verified_field_cohorts')
          .select('*')
          .order('gameplay_ruleset_version'),
        administrator.client
          .from('admin_verified_field_champion_cohorts')
          .select('*')
          .order('gameplay_ruleset_version'),
        administrator.client
          .from('admin_verified_field_augment_cohorts')
          .select('*')
          .order('gameplay_ruleset_version'),
      ]);

    expect(anonymousRead.error).not.toBeNull();
    expect(serviceRead.error).not.toBeNull();
    expect(ownerRead).toMatchObject({ data: [], error: null });
    expect(adminRead.error).toBeNull();
    expect(adminRead.data).toHaveLength(2);
    expect(adminRead.data?.map((row) => row.gameplay_ruleset_version)).toEqual([16, 17]);

    const v17 = adminRead.data?.find((row) => row.gameplay_ruleset_version === 17);
    const expectedWilson = calculateWilsonInterval95(12, 30);
    expect(v17).toMatchObject({
      difficulty: 'easy',
      mode: 'normal',
      initial_team_size: 1,
      initial_composition_hash: 'a5302e2442a975c4c6c63da00bdb7388ce6efb3f84c2b669cf04064d4b8a37fe',
      meta_level: 2,
      sample_size: 30,
      wins: 12,
      defeats: 18,
      win_rate: 0.4,
      death_biome_counts: { top_lane: 18 },
    });
    expect(v17?.win_rate_wilson_low).toBeCloseTo(expectedWilson.lower, 12);
    expect(v17?.win_rate_wilson_high).toBeCloseTo(expectedWilson.upper, 12);

    expect(champions.error).toBeNull();
    expect(champions.data).toHaveLength(2);
    expect(champions.data?.find((row) => row.gameplay_ruleset_version === 17)).toMatchObject({
      champion_id: 'Garen',
      cohort_sample_size: 30,
      sample_size: 30,
      participation_rate: 1,
      wins: 12,
    });

    expect(augments.error).toBeNull();
    expect(augments.data).toHaveLength(2);
    expect(augments.data?.find((row) => row.gameplay_ruleset_version === 17)).toMatchObject({
      augment_id: 'iron_skin',
      cohort_sample_size: 30,
      sample_size: 30,
      selection_rate: 1,
      wins: 12,
    });

    const exposed = Object.keys(v17 ?? {});
    expect(exposed).not.toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'player_id',
        'run_id',
        'attempt_id',
        'seed',
        'result',
        'response',
        'run_ledger',
        'verified_at',
      ]),
    );
  });
});
