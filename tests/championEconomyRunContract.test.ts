import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseChampionRunAccessSnapshot } from '@/services/championEconomyRunContract';
import { startRunAttempt, verifyRunAttempt } from '@/services/runAttemptService';

const remote = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({
  supabase: { rpc: remote.rpc, functions: { invoke: remote.invoke } },
}));
const attemptId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const access = {
  version: 1,
  enabled: true,
  economyVersion: 1,
  catalogVersion: 1,
  rotationId: '2026-W41-v1-r21',
  rotationStartsAt: '2026-10-05T00:00:00Z',
  rotationEndsAt: '2026-10-12T00:00:00Z',
  allowedChampionIds: ['Garen', 'Annie', 'Ashe', 'Lux'],
  rotationChampionIds: ['Lux'],
};
const startInput = {
  commandId: '33333333-3333-4333-8333-333333333333',
  mode: 'normal' as const,
  team: ['Lux'],
  runeIds: [],
  difficulty: 'normal' as const,
};
function startResponse(extra: Record<string, unknown> = {}) {
  return {
    attempt_id: attemptId,
    run_uuid: `attempt_${runId}`,
    status: 'started',
    ruleset_version: 3,
    gameplay_ruleset_version: 21,
    engine_version: 'run-engine-v21',
    seed: 42,
    mode: 'normal',
    difficulty: 'normal',
    initial_team: ['Lux'],
    rune_ids: [],
    enhancement_snapshot: {},
    mastery_snapshot: {},
    started_at: '2026-10-05T12:00:00Z',
    expires_at: '2026-10-06T12:00:00Z',
    last_sequence: 0,
    journal_hash: 'frozen-hash',
    replayed: false,
    ...extra,
  };
}
function verifiedResponse(extra: Record<string, unknown> = {}) {
  return {
    run_id: runId,
    replayed: false,
    candies_earned: 13,
    candies_by_champion: { Lux: 13 },
    candies_per_champion: 13,
    progression_version: 3,
    progression_source: 'verified',
    shards_earned: 25,
    shards_balance: 425,
    shard_economy_version: 1,
    shard_rotation_first_win_champion_ids: [],
    ...extra,
  };
}

describe('run economy server contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retains the frozen server access without accepting access assertions in the start request', async () => {
    remote.rpc.mockResolvedValue({
      data: startResponse({ champion_access_snapshot: access, economy_version: 1 }),
      error: null,
    });
    const result = await startRunAttempt(startInput);
    expect(remote.rpc).toHaveBeenCalledWith('start_run_attempt', {
      p_command_id: startInput.commandId,
      p_team: ['Lux'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(result.data?.championAccessSnapshot).toEqual(access);
    expect(result.data?.championAccessSnapshot?.allowedChampionIds).not.toBe(
      access.allowedChampionIds,
    );
    expect(result.data?.economyVersion).toBe(1);
  });

  it('keeps pre-economy attempts and disabled snapshots compatible', async () => {
    remote.rpc.mockResolvedValueOnce({ data: startResponse(), error: null });
    expect((await startRunAttempt(startInput)).data?.championAccessSnapshot).toBeUndefined();
    remote.rpc.mockResolvedValueOnce({
      data: startResponse({
        champion_access_snapshot: { ...access, enabled: false, economyVersion: null },
        economy_version: null,
      }),
      error: null,
    });
    expect((await startRunAttempt(startInput)).data?.economyVersion).toBeNull();
  });

  it('retains the server Daily offer snapshot without sending ownership or changing Daily inputs', async () => {
    remote.rpc.mockResolvedValue({
      data: startResponse({
        mode: 'daily',
        daily_date: '2026-10-05',
        daily_ruleset_version: 21,
        daily_score_version: 15,
        champion_access_snapshot: access,
        economy_version: 1,
      }),
      error: null,
    });
    expect(
      (await startRunAttempt({ ...startInput, mode: 'daily' })).data?.championAccessSnapshot,
    ).toEqual(access);
    expect(remote.rpc).toHaveBeenCalledWith('start_daily_run_attempt', {
      p_command_id: startInput.commandId,
      p_team: ['Lux'],
      p_rune_ids: [],
    });
  });

  it.each([
    { economy_version: 1 },
    { champion_access_snapshot: access, economy_version: 2 },
    {
      champion_access_snapshot: { ...access, rotationEndsAt: access.rotationStartsAt },
      economy_version: 1,
    },
    {
      champion_access_snapshot: { ...access, allowedChampionIds: ['Lux', 'Lux'] },
      economy_version: 1,
    },
    { champion_access_snapshot: { ...access, economyVersion: null }, economy_version: 1 },
  ])('rejects an inconsistent start economy contract %j', async (extra) => {
    remote.rpc.mockResolvedValue({ data: startResponse(extra), error: null });
    expect((await startRunAttempt(startInput)).error).toBeInstanceOf(Error);
  });

  it('keeps canonical shard rewards separate from mastery and preserves replay flags', async () => {
    remote.invoke.mockResolvedValue({
      data: { response: verifiedResponse({ replayed: true }) },
      error: null,
    });
    expect((await verifyRunAttempt(attemptId)).data?.progression).toMatchObject({
      replayed: true,
      candiesEarned: 13,
      candiesByChampion: { Lux: 13 },
      shardsEarned: 25,
      shardsBalance: 425,
      shardEconomyVersion: 1,
      shardRotationFirstWinChampionIds: [],
    });
    expect(remote.invoke).toHaveBeenCalledWith('verify-run', { body: { attempt_id: attemptId } });
  });

  it.each([
    { shards_earned: -1 },
    { shards_balance: Number.MAX_SAFE_INTEGER + 1 },
    { shard_economy_version: 2 },
    { shard_economy_version: null },
    { shard_rotation_first_win_champion_ids: ['Lux', 'Lux'] },
    { shard_rotation_first_win_champion_ids: null },
  ])('rejects malformed wallet/reward responses %j', async (extra) => {
    remote.invoke.mockResolvedValue({ data: { response: verifiedResponse(extra) }, error: null });
    expect((await verifyRunAttempt(attemptId)).data).toBeNull();
  });

  it('accepts explicit disabled economy results and rejects partial economic outcomes', async () => {
    remote.invoke.mockResolvedValueOnce({
      data: { response: verifiedResponse({ shards_earned: 0, shard_economy_version: null }) },
      error: null,
    });
    expect((await verifyRunAttempt(attemptId)).data?.progression.shardEconomyVersion).toBeNull();
    remote.invoke.mockResolvedValueOnce({
      data: { response: verifiedResponse({ shards_balance: undefined }) },
      error: null,
    });
    expect((await verifyRunAttempt(attemptId)).data).toBeNull();
  });

  it.each([
    null,
    [],
    'owned',
    {},
    { ...access, catalogVersion: 0 },
    { ...access, rotationChampionIds: ['Lux', 'Lux'] },
    { ...access, rotationId: null },
    { ...access, rotationStartsAt: 'not-a-date' },
  ])('rejects invalid roster snapshots %j', (value) => {
    expect(parseChampionRunAccessSnapshot(value)).toBeNull();
  });
});
