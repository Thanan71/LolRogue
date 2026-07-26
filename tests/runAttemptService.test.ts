import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  appendRunAttemptCommands,
  recoverVerifiedRunAttempt,
  RunVerificationRejectedError,
  sealRunAttempt,
  startRunAttempt,
  verifyRunAttempt,
} from '@/services/runAttemptService';

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: {
    rpc: supabaseMocks.rpc,
    functions: { invoke: supabaseMocks.invoke },
  },
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_UUID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_RUN_UUID = `attempt_${RUN_UUID}`;
const COMMAND_ID = '33333333-3333-4333-8333-333333333333';

function startResponse(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: ATTEMPT_ID,
    run_uuid: ATTEMPT_RUN_UUID,
    status: 'started',
    ruleset_version: 2,
    gameplay_ruleset_version: 4,
    engine_version: 'run-engine-v1',
    gameplay_content_hash: 'content-hash',
    seed: 42,
    mode: 'normal',
    difficulty: 'hard',
    initial_team: ['Garen'],
    rune_ids: ['press_the_attack'],
    enhancement_snapshot: { Garen: { hp_1: 1 } },
    started_at: '2026-07-23T12:00:00.000Z',
    expires_at: '2026-07-24T12:00:00.000Z',
    last_sequence: 0,
    journal_hash: 'initial-hash',
    replayed: false,
    ...overrides,
  };
}

function statusResponse(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: ATTEMPT_ID,
    run_uuid: ATTEMPT_RUN_UUID,
    status: 'verified',
    ruleset_version: 2,
    engine_version: 'run-engine-v1',
    seed: 42,
    mode: 'normal',
    difficulty: 'normal',
    initial_team: ['Garen'],
    rune_ids: [],
    started_at: '2026-07-23T12:00:00.000Z',
    expires_at: '2026-07-24T12:00:00.000Z',
    last_sequence: 3,
    journal_hash: 'journal-3',
    response: {
      run_id: RUN_UUID,
      replayed: true,
      candies_earned: 13,
      candies_per_champion: 13,
      progression_version: 2,
      progression_source: 'verified',
    },
    rejection_code: null,
    ...overrides,
  };
}

describe('runAttemptService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts an attempt with the narrow RPC contract and parses canonical fields', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: startResponse(),
      error: null,
    });

    const result = await startRunAttempt({
      commandId: COMMAND_ID,
      mode: 'normal',
      team: ['Garen'],
      runeIds: ['press_the_attack'],
      difficulty: 'hard',
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('start_run_attempt', {
      p_command_id: COMMAND_ID,
      p_team: ['Garen'],
      p_rune_ids: ['press_the_attack'],
      p_difficulty: 'hard',
      p_mode: 'normal',
    });
    expect(result).toMatchObject({
      error: null,
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: ATTEMPT_RUN_UUID,
        seed: 42,
        rulesetVersion: 2,
        enhancementSnapshot: { Garen: { hp_1: 1 } },
      },
    });
  });

  it('starts Daily through the dedicated RPC and requires its canonical UTC contract', async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: { expired: 0 }, error: null })
      .mockResolvedValueOnce({
        data: startResponse({
          mode: 'daily',
          difficulty: 'normal',
          enhancement_snapshot: {},
          daily_date: '2026-07-26',
          daily_ruleset_version: 1,
          daily_score_version: 1,
          expires_at: '2026-07-27T00:00:00.000Z',
        }),
        error: null,
      });

    const result = await startRunAttempt({
      commandId: COMMAND_ID,
      mode: 'daily',
      team: ['Garen'],
      runeIds: [],
      difficulty: 'hard',
    });

    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(2, 'start_daily_run_attempt', {
      p_command_id: COMMAND_ID,
      p_team: ['Garen'],
      p_rune_ids: [],
    });
    expect(supabaseMocks.rpc.mock.calls[1]?.[1]).not.toHaveProperty('p_difficulty');
    expect(result).toMatchObject({
      error: null,
      data: {
        mode: 'daily',
        difficulty: 'normal',
        dailyDate: '2026-07-26',
        dailyRulesetVersion: 1,
        dailyScoreVersion: 1,
        enhancementSnapshot: {},
      },
    });

    supabaseMocks.rpc
      .mockReset()
      .mockResolvedValueOnce({ data: { expired: 0 }, error: null })
      .mockResolvedValueOnce({
        data: startResponse({ mode: 'daily', difficulty: 'normal' }),
        error: null,
      });
    const malformed = await startRunAttempt({
      commandId: COMMAND_ID,
      mode: 'daily',
      team: ['Garen'],
      runeIds: [],
      difficulty: 'normal',
    });
    expect(malformed.data).toBeNull();
    expect(malformed.error?.message).toBe('Invalid start_run_attempt response');
  });

  it('appends only command identity, sequence, kind and payload', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        attempt_id: ATTEMPT_ID,
        status: 'started',
        last_sequence: 1,
        journal_hash: 'journal-1',
        accepted: 1,
        replayed: false,
      },
      error: null,
    });

    await appendRunAttemptCommands(ATTEMPT_ID, [
      {
        commandId: COMMAND_ID,
        sequence: 1,
        kind: 'move_node',
        payload: { node_id: 'top_lane_start' },
        dedupeKey: 'local-only',
      },
    ]);

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('append_run_attempt_commands', {
      p_attempt_id: ATTEMPT_ID,
      p_commands: [
        {
          command_id: COMMAND_ID,
          sequence: 1,
          kind: 'move_node',
          payload: { node_id: 'top_lane_start' },
        },
      ],
    });
  });

  it('accepts an idempotent seal that already reached verified', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        attempt_id: ATTEMPT_ID,
        run_uuid: ATTEMPT_RUN_UUID,
        status: 'verified',
        last_sequence: 3,
        journal_hash: 'journal-3',
        accepted: true,
        replayed: true,
      },
      error: null,
    });

    const result = await sealRunAttempt(ATTEMPT_ID, COMMAND_ID, 3);

    expect(result.data?.status).toBe('verified');
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('seal_run_attempt', {
      p_attempt_id: ATTEMPT_ID,
      p_finish_command_id: COMMAND_ID,
      p_expected_sequence: 3,
    });
  });

  it('invokes Edge with only attempt_id and parses verified progression', async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        response: {
          run_id: RUN_UUID,
          replayed: false,
          candies_earned: 18,
          candies_per_champion: 9,
          progression_version: 2,
          progression_source: 'verified',
        },
      },
      error: null,
    });

    const result = await verifyRunAttempt(ATTEMPT_ID);

    expect(supabaseMocks.invoke).toHaveBeenCalledWith('verify-run', {
      body: { attempt_id: ATTEMPT_ID },
    });
    expect(result).toMatchObject({
      error: null,
      data: {
        progression: {
          runId: RUN_UUID,
          candiesEarned: 18,
          progressionSource: 'verified',
        },
      },
    });
  });

  it('classifies an Edge rejection or expiry as terminal', async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            error: 'run_verification_rejected',
            rejection_code: 'illegal_trace',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    });

    const rejected = await verifyRunAttempt(ATTEMPT_ID);
    expect(rejected.error).toBeInstanceOf(RunVerificationRejectedError);
    expect((rejected.error as RunVerificationRejectedError).code).toBe('illegal_trace');

    supabaseMocks.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'run_attempt_expired' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });
    const expired = await verifyRunAttempt(ATTEMPT_ID);
    expect(expired.error).toBeInstanceOf(RunVerificationRejectedError);
    expect((expired.error as RunVerificationRejectedError).code).toBe('run_attempt_expired');
  });

  it('recovers a canonical response through status without calling Edge', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: statusResponse(),
      error: null,
    });

    const result = await recoverVerifiedRunAttempt(ATTEMPT_ID);

    expect(result.data?.progression).toMatchObject({
      runId: RUN_UUID,
      replayed: true,
      progressionSource: 'verified',
    });
    expect(supabaseMocks.invoke).not.toHaveBeenCalled();
  });

  it('stops when stale-attempt cleanup fails and rejects a malformed canonical start', async () => {
    const cleanupError = new Error('cleanup unavailable');
    supabaseMocks.rpc.mockResolvedValueOnce({ data: null, error: cleanupError });

    const cleanupFailure = await startRunAttempt({
      commandId: COMMAND_ID,
      mode: 'normal',
      team: ['Garen'],
      runeIds: [],
      difficulty: 'normal',
    });
    expect(cleanupFailure).toEqual({ data: null, error: cleanupError });
    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1);

    supabaseMocks.rpc.mockReset();
    supabaseMocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({
      data: startResponse({ initial_team: ['Garen', 'Lux'] }),
      error: null,
    });

    const malformed = await startRunAttempt({
      commandId: COMMAND_ID,
      mode: 'normal',
      team: ['Garen'],
      runeIds: [],
      difficulty: 'normal',
    });
    expect(malformed.data).toBeNull();
    expect(malformed.error?.message).toBe('Invalid start_run_attempt response');
  });

  it('returns parser and transport errors for malformed append and seal responses', async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: {
        attempt_id: ATTEMPT_ID,
        status: 'started',
        last_sequence: 1,
        journal_hash: 'journal-1',
        accepted: '1',
        replayed: false,
      },
      error: null,
    });

    const malformedAppend = await appendRunAttemptCommands(ATTEMPT_ID, []);
    expect(malformedAppend.data).toBeNull();
    expect(malformedAppend.error?.message).toBe('Invalid append_run_attempt_commands response');

    supabaseMocks.rpc.mockRejectedValueOnce('offline');
    const failedSeal = await sealRunAttempt(ATTEMPT_ID, COMMAND_ID, 1);
    expect(failedSeal.data).toBeNull();
    expect(failedSeal.error?.message).toBe('offline');
  });

  it('recovers rejected attempts as terminal and refuses unfinished attempts', async () => {
    supabaseMocks.rpc.mockResolvedValueOnce({
      data: statusResponse({ status: 'rejected', rejection_code: 'illegal_trace' }),
      error: null,
    });
    const rejected = await recoverVerifiedRunAttempt(ATTEMPT_ID);
    expect(rejected.error).toBeInstanceOf(RunVerificationRejectedError);
    expect((rejected.error as RunVerificationRejectedError).code).toBe('illegal_trace');

    supabaseMocks.rpc.mockResolvedValueOnce({
      data: statusResponse({ status: 'started', response: null }),
      error: null,
    });
    const unfinished = await recoverVerifiedRunAttempt(ATTEMPT_ID);
    expect(unfinished.data).toBeNull();
    expect(unfinished.error?.message).toBe('Run attempt is started');
  });

  it('keeps Edge 5xx and malformed error bodies retryable while parsing direct rejections', async () => {
    const serverError = {
      context: new Response(JSON.stringify({ error: 'temporary_failure' }), { status: 503 }),
    };
    supabaseMocks.invoke.mockResolvedValueOnce({ data: null, error: serverError });
    const retryable = await verifyRunAttempt(ATTEMPT_ID);
    expect(retryable.error).toBe(serverError);

    const malformedError = {
      context: new Response('not-json', {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
    supabaseMocks.invoke.mockResolvedValueOnce({ data: null, error: malformedError });
    const malformed = await verifyRunAttempt(ATTEMPT_ID);
    expect(malformed.error).toBe(malformedError);

    supabaseMocks.invoke.mockResolvedValueOnce({
      data: {
        status: 'rejected',
        error: { code: 'engine_mismatch', message: 'Unsupported engine.' },
      },
      error: null,
    });
    const rejected = await verifyRunAttempt(ATTEMPT_ID);
    expect(rejected.error).toBeInstanceOf(RunVerificationRejectedError);
    expect(rejected.error).toMatchObject({
      code: 'engine_mismatch',
      message: 'Unsupported engine.',
    });
  });

  it('parses a verified server summary and rejects malformed champion statistics', async () => {
    const response = {
      run_id: RUN_UUID,
      replayed: false,
      candies_earned: 18,
      candies_per_champion: 18,
      progression_version: 2,
      progression_source: 'verified',
      summary: {
        won: true,
        waves_completed: 5,
        biomes_visited: ['top_lane'],
        total_kills: 3,
        total_damage: 900,
        gold_earned: 250,
        run_level: 2,
        champion_stats: [
          {
            champion_id: 'Garen',
            kills: 3,
            total_damage: 900,
            survived: true,
          },
        ],
      },
    };
    supabaseMocks.invoke.mockResolvedValueOnce({ data: { response }, error: null });

    const verified = await verifyRunAttempt(ATTEMPT_ID);
    expect(verified.data?.summary).toMatchObject({
      won: true,
      wavesCompleted: 5,
      championStats: [{ championId: 'Garen', kills: 3 }],
    });

    supabaseMocks.invoke.mockResolvedValueOnce({
      data: {
        response: {
          ...response,
          summary: {
            ...response.summary,
            champion_stats: [{ champion_id: 'Garen', kills: 'three' }],
          },
        },
      },
      error: null,
    });
    const malformed = await verifyRunAttempt(ATTEMPT_ID);
    expect(malformed.error).toBeNull();
    expect(malformed.data?.summary).toBeNull();
    expect(malformed.data?.progression.candiesEarned).toBe(18);
  });
});
