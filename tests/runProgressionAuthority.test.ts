// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAuthorityReplaySession,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '@/game/authority';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { resolveRegisteredAuthorityVerifier } from './helpers/authorityBundleResolver';
import {
  createVeigarBiomeReplayFixture,
  VEIGAR_FIRST_COMBAT_ATTEMPT,
  VEIGAR_FIRST_COMBAT_COMMANDS,
} from './helpers/veigarRunProgressionFixture';

const key = 'veigar.phenomenal_power';
const rules = {
  inventory: [],
  augmentIds: [],
  currentBiomeIndex: 0,
  getUnlockedEnhancements: () => ({}),
  getMasteryLevel: () => 0,
};

describe('run progression authority contract', () => {
  it('derives stacks from the deterministic combat and restores exactly the same AP', () => {
    const result = replayAuthorityRun(VEIGAR_FIRST_COMBAT_ATTEMPT, VEIGAR_FIRST_COMBAT_COMMANDS);
    const veigar = result.snapshot.team.find((member) => member.championId === 'Veigar')!;
    expect(veigar.runProgress).toEqual({ [key]: 1 });
    expect(result.snapshot.team.find((member) => member.championId === 'Garen')).not.toHaveProperty(
      'runProgress',
    );
    const restored = buildRunPlayerTeam([veigar], rules)[0]!;
    const fresh = buildRunPlayerTeam([{ championId: 'Veigar' }], rules)[0]!;
    expect(restored.getEnhancedStats().abilityPower - fresh.getEnhancedStats().abilityPower).toBe(
      1,
    );
    expect(
      result.combatSummaries[0]!.playerTeam.initial.find(
        (member) => member.championId === 'Veigar',
      ),
    ).not.toHaveProperty('runProgress');
    expect(
      result.combatSummaries[0]!.playerTeam.final.find((member) => member.championId === 'Veigar')
        ?.runProgress,
    ).toEqual({ [key]: 1 });
    expect(
      result.combatSummaries[0]!.playerAfterEncounter?.find(
        (member) => member.championId === 'Veigar',
      )?.runProgress,
    ).toEqual({ [key]: 1 });
  });

  it('replays biome advancement without resetting counters and isolates returned snapshots', () => {
    const fixture = createVeigarBiomeReplayFixture();
    expect(fixture.result.snapshot.currentBiomeIndex).toBe(1);
    expect(fixture.result.snapshot.team[0]!.runProgress?.[key]).toBeGreaterThan(0);
    expect(replayAuthorityRun(fixture.attempt, fixture.commands)).toEqual(fixture.result);
    const session = createAuthorityReplaySession(fixture.attempt);
    fixture.commands.forEach((command) => session.append(command));
    const returned = session.getResult();
    returned.snapshot.team[0]!.runProgress![key] = 200;
    const combat = returned.combatSummaries.find(
      (summary) => summary.playerAfterEncounter?.[0]?.runProgress,
    );
    combat!.playerAfterEncounter![0]!.runProgress![key] = 200;
    expect(session.getResult()).toEqual(fixture.result);
    expect(replayAuthorityRun(fixture.attempt, []).snapshot.team[0]).not.toHaveProperty(
      'runProgress',
    );
  });

  it('ignores forged initial counters and rejects counters attached to combat commands', () => {
    const forgedAttempt = structuredClone(VEIGAR_FIRST_COMBAT_ATTEMPT);
    Object.assign(forgedAttempt.team[0]!, { runProgress: { [key]: 200 } });
    expect(replayAuthorityRun(forgedAttempt, VEIGAR_FIRST_COMBAT_COMMANDS)).toEqual(
      replayAuthorityRun(VEIGAR_FIRST_COMBAT_ATTEMPT, VEIGAR_FIRST_COMBAT_COMMANDS),
    );
    const forgedCommands = structuredClone(VEIGAR_FIRST_COMBAT_COMMANDS);
    Object.assign(forgedCommands[1]!.payload, { runProgress: { [key]: 200 } });
    expect(
      verifyAuthorityRun(VEIGAR_FIRST_COMBAT_ATTEMPT, forgedCommands, { requireTerminal: false }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_command', commandIndex: 1 } });
  });

  it('preserves the byte-for-byte v21 bundle and its exact historical replay', async () => {
    const archive = readFileSync(
      new URL('../supabase/functions/verify-run/run-authority-v21.bundle.ts', import.meta.url),
    );
    expect(createHash('sha256').update(archive).digest('hex')).toBe(
      '5fb9483ac2ca82456254bd82aea327b7c7162246517660c3fc20dfe075d0117f',
    );
    const verifier = await resolveRegisteredAuthorityVerifier(
      'run-engine-v21',
      '9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6',
    );
    expect(verifier).toBeDefined();
    const attempt = {
      ...VEIGAR_FIRST_COMBAT_ATTEMPT,
      seed: 2,
      team: [{ championId: 'Garen', statMultiplier: 10 }],
    };
    const commands = [
      ...VEIGAR_FIRST_COMBAT_COMMANDS,
      { sequence: 3, kind: 'resolve_node' as const, payload: { node_id: 'node_top_lane_0' } },
    ];
    const result = verifier!.replay(attempt, commands);
    expect(createHash('sha256').update(JSON.stringify(result)).digest('hex')).toBe(
      '73e3bb11ed03f26ed9dd1f828f7b025078308836b7e61e1358f9d4b1a860f69a',
    );
    expect(result.snapshot.team[0]).not.toHaveProperty('runProgress');
  });
});
