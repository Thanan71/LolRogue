// @vitest-environment node
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { replayAuthorityRun } from '@/game/authority';
import { buildVerifiedEconomyResult } from '../supabase/functions/verify-run/champion-economy';

const attemptId = '11111111-1111-4111-8111-111111111111';
const source = readFileSync(
  new URL('../supabase/functions/verify-run/index.ts', import.meta.url),
  'utf8',
);
const replay = replayAuthorityRun(
  {
    runUuid: attemptId,
    seed: 4242,
    difficulty: 'normal',
    mode: 'normal',
    team: [{ championId: 'Garen' }],
    runeIds: [],
    enhancementSnapshot: {},
    masterySnapshot: {},
  },
  [{ sequence: 1, kind: 'abandon_run', payload: {} }],
);

function handlerFixture(extra: Record<string, unknown> = {}, snapshot: unknown = replay.snapshot) {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  const claim = {
    claimed: true,
    user_id: 'owner',
    lease_token: attemptId,
    engine_version: 'run-engine-v21',
    gameplay_content_hash: 'frozen-v21-hash',
    run_uuid: attemptId,
    seed: 4242,
    mode: 'normal',
    difficulty: 'normal',
    initial_team: ['Garen'],
    rune_ids: [],
    enhancement_snapshot: {},
    mastery_snapshot: {},
    commands: [{ sequence: 1, kind: 'abandon_run', payload: {} }],
    economy_version: 1,
    champion_access_snapshot: { version: 1, enabled: true, economyVersion: 1 },
    ...extra,
  };
  const adminRpc = vi.fn(async (name: string, _payload: Record<string, unknown>) => {
    if (name === 'claim_run_verification') return { data: claim, error: null };
    if (name === 'reject_run_verification') return { data: { status: 'rejected' }, error: null };
    return { data: { response: { status: 'verified', shards_earned: 0 } }, error: null };
  });
  const caller = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner' } }, error: null }) },
    rpc: vi.fn().mockResolvedValue({
      data: {
        status: 'finished',
        engine_version: claim.engine_version,
        gameplay_content_hash: claim.gameplay_content_hash,
      },
      error: null,
    }),
  };
  const verify = vi.fn().mockReturnValue({ ok: true, result: { ...replay, snapshot } });
  const script = stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm, ''));
  runInNewContext(script, {
    Deno: {
      env: {
        get: (key: string) =>
          ({
            SUPABASE_URL: 'https://example.test',
            SUPABASE_ANON_KEY: 'anon',
            SUPABASE_SERVICE_ROLE_KEY: 'service',
          })[key as 'SUPABASE_URL'],
      },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
    createClient: (_url: string, key: string) => (key === 'service' ? { rpc: adminRpc } : caller),
    resolveAuthorityVerifier: async () => ({ verify }),
    buildVerifiedEconomyResult,
    Response,
    crypto,
    TextEncoder,
    console,
  });
  if (!handler) throw new Error('Edge handler did not register');
  const invoke = (body: Record<string, unknown> = {}) =>
    handler!(
      new Request('https://example.test/verify-run', {
        method: 'POST',
        headers: { Authorization: 'Bearer owner-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt_id: attemptId, ...body }),
      }),
    );
  return { invoke, adminRpc, verify };
}

describe('Edge economy authority boundary', () => {
  it('builds economics only from the trusted replay despite forged request fields', async () => {
    const fixture = handlerFixture();
    const response = await fixture.invoke({
      economy: { version: 1, waves_completed: 9999, biomes_completed: 6 },
      shards_earned: 99999,
      initial_team: ['Lux'],
    });
    expect(response.status).toBe(200);
    const completion = fixture.adminRpc.mock.calls.find(
      ([name]) => name === 'complete_run_verification',
    );
    const payload = completion?.[1] as { p_result: Record<string, unknown> } | undefined;
    expect(payload?.p_result.economy).toEqual({
      version: 1,
      waves_completed: 0,
      biomes_completed: 0,
    });
    expect(fixture.verify.mock.calls[0][0].team).toEqual([{ championId: 'Garen' }]);
    expect(payload?.p_result.ledger).toMatchObject({ version: 2 });
  });

  it.each([null, undefined])(
    'preserves the exact pre-economy result when version is %s',
    async (version) => {
      const fixture = handlerFixture({ economy_version: version, champion_access_snapshot: null });
      expect((await fixture.invoke()).status).toBe(200);
      const payload = fixture.adminRpc.mock.calls.find(
        ([name]) => name === 'complete_run_verification',
      )?.[1] as {
        p_result: Record<string, unknown>;
      };
      expect(payload.p_result).not.toHaveProperty('economy');
      expect(payload.p_result.waves_completed).toBe(replay.snapshot.totalWavesCompleted);
    },
  );

  it('does not finalize or credit an inconsistent economics snapshot', async () => {
    const fixture = handlerFixture({
      champion_access_snapshot: { version: 1, enabled: false, economyVersion: null },
    });
    const response = await fixture.invoke();
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ rejection_code: 'invalid_economy_contract' });
    expect(fixture.adminRpc.mock.calls.some(([name]) => name === 'complete_run_verification')).toBe(
      false,
    );
  });

  it('rejects malformed terminal replay metrics instead of fabricating shard rewards', async () => {
    const fixture = handlerFixture({}, { ...replay.snapshot, currentBiomeIndex: 6 });
    expect((await fixture.invoke()).status).toBe(422);
    expect(fixture.adminRpc.mock.calls.some(([name]) => name === 'complete_run_verification')).toBe(
      false,
    );
  });

  it('never credits an attempt belonging to another account', async () => {
    const fixture = handlerFixture({ user_id: 'other-account' });
    expect((await fixture.invoke()).status).toBe(422);
    expect(fixture.verify).not.toHaveBeenCalled();
    expect(fixture.adminRpc.mock.calls.some(([name]) => name === 'complete_run_verification')).toBe(
      false,
    );
  });
});
