// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  createAuthorityReplaySession,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '@/game/authority';
import rawRegistry from '../config/authority-versions.json';
import { resolveRegisteredAuthorityVerifier } from './helpers/authorityBundleResolver';
import {
  ENHANCEMENT_PARITY_CHAMPIONS,
  enhancementFirstBattle,
  enhancementParityAttempt,
} from './helpers/enhancementParityFixtures';

describe('TREE-04: frozen enhancement snapshots and source / Edge parity', () => {
  it.each(ENHANCEMENT_PARITY_CHAMPIONS)(
    'replays %s identically in the current Edge bundle after a command-boundary reload',
    async (championId) => {
      const attempt = enhancementParityAttempt(championId, 17);
      const { move, nodeId } = enhancementFirstBattle(attempt, true);
      const combat = {
        sequence: 2,
        kind: 'resolve_combat' as const,
        payload: { node_id: nodeId, actions_json: 'auto' },
      };
      const commands = [move, combat];
      const source = replayAuthorityRun(attempt, commands);
      const bundled = await resolveRegisteredAuthorityVerifier(
        AUTHORITY_ENGINE_VERSION,
        AUTHORITY_CONTENT_HASH,
      );
      expect(bundled).toBeDefined();
      expect(bundled!.replay(attempt, commands)).toEqual(source);
      expect(bundled!.verify(attempt, commands, { requireTerminal: false })).toEqual(
        verifyAuthorityRun(attempt, commands, { requireTerminal: false }),
      );
      const restored = bundled!.createSession(JSON.parse(JSON.stringify(attempt)));
      restored.append(JSON.parse(JSON.stringify(move)));
      expect(restored.getResult()).toEqual(replayAuthorityRun(attempt, [move]));
      restored.append(JSON.parse(JSON.stringify(combat)));
      expect(restored.getResult()).toEqual(source);
    },
  );

  it('keeps an active attempt frozen when later account ranks change', () => {
    const accountSnapshot = enhancementParityAttempt('Ashe', 17);
    const trustedAttempt = structuredClone(accountSnapshot);
    const { move, nodeId } = enhancementFirstBattle(trustedAttempt, true);
    const combat = {
      sequence: 2,
      kind: 'resolve_combat' as const,
      payload: { node_id: nodeId, actions_json: 'auto' },
    };
    const session = createAuthorityReplaySession(accountSnapshot);
    session.append(move);
    accountSnapshot.enhancementSnapshot.Ashe = {};
    session.append(combat);
    expect(session.getResult()).toEqual(replayAuthorityRun(trustedAttempt, [move, combat]));
  });

  it('rejects forged node IDs, ranks and client-authored effect payloads', () => {
    const attempt = enhancementParityAttempt('Garen');
    const { move, nodeId } = enhancementFirstBattle(attempt, true);
    const invalidRanks: Record<string, number>[] = [
      { forged: 1 },
      { fighter_core_1: 2 },
      { fighter_core_1: -1 },
    ];
    for (const ranks of invalidRanks) {
      expect(
        verifyAuthorityRun({ ...attempt, enhancementSnapshot: { Garen: ranks } }, [], {
          requireTerminal: false,
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid_attempt' } });
    }
    expect(
      verifyAuthorityRun(
        attempt,
        [
          move,
          {
            sequence: 2,
            kind: 'resolve_combat',
            payload: {
              node_id: nodeId,
              actions_json: 'auto',
              enhancementEffects: [{ type: 'damage', value: 999999 }],
            },
          },
        ],
        { requireTerminal: false },
      ),
    ).toMatchObject({ ok: false, error: { code: 'invalid_command' } });
  });

  it('preserves the exact 0.2.5 bundle bytes and its historical enhancement replay', async () => {
    const legacy = rawRegistry.versions.find((entry) => entry.engine === 'run-engine-0.2.5')!;
    expect(legacy.contentHash).toBe(
      '9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa',
    );
    expect(
      createHash('sha256')
        .update(readFileSync(resolve(process.cwd(), legacy.bundle)))
        .digest('hex'),
    ).toBe('e6b73c06bc2cb68736f3801c0ebf9869479023cfce7c99f213d763766cb062f1');
    const verifier = await resolveRegisteredAuthorityVerifier(legacy.engine, legacy.contentHash);
    expect(verifier).toBeDefined();
    const attempt = {
      runUuid: 'e4444444-4444-4444-8444-444444444444',
      seed: 0,
      difficulty: 'easy' as const,
      mode: 'normal' as const,
      team: [{ championId: 'Garen' }, { championId: 'Ashe' }],
      runeIds: [],
      enhancementSnapshot: {
        Garen: { fighter_core_1: 1, fighter_bruiser_1: 1, fighter_bruiser_2: 1 },
      },
      masterySnapshot: { Garen: 4, Ashe: 4 },
    };
    const commands = [
      { sequence: 1, kind: 'move_node' as const, payload: { node_id: 'node_top_lane_0' } },
      {
        sequence: 2,
        kind: 'resolve_combat' as const,
        payload: { node_id: 'node_top_lane_0', actions_json: 'auto' },
      },
    ];
    const replay = verifier!.replay(attempt, commands);
    expect(createHash('sha256').update(JSON.stringify(replay)).digest('hex')).toBe(
      'd5fdee50c4d835ff3f42f94ca65d9ae348d226884ec83a3770f22df6b4704986',
    );
  });
});
