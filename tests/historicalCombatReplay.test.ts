// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { projectHistoricalCombat } from '@/features/combat/application/historicalCombatProjection';
import {
  type HistoricalAuthorityVerifier,
  historicalAuthorityAttempt,
  historicalAuthorityCommands,
  resolveHistoricalAuthorityCombat,
} from '@/game/authority/historicalAuthority';
import { appendRunAuthorityCommand } from '@/game/run/runAuthorityJournal';
import { migratePersistedRunState, RUN_SCHEMA_VERSION } from '@/stores/persistence/runPersistence';
import type { RunCommandInput } from '@/types/runAttempt';
import { resolveRegisteredAuthorityVerifier } from './helpers/authorityBundleResolver';
import {
  HISTORICAL_COMBAT_ENGINE,
  HISTORICAL_COMBAT_HASH,
  historicalCombatFixture,
} from './helpers/historicalCombatFixture';

describe('TREE-04: historical browser continuation through its frozen authority', () => {
  let verifier: HistoricalAuthorityVerifier;
  beforeAll(async () => {
    verifier = (await resolveRegisteredAuthorityVerifier(
      HISTORICAL_COMBAT_ENGINE,
      HISTORICAL_COMBAT_HASH,
    ))!;
    expect(verifier).toBeDefined();
  });

  it('replays the saved 0.2.5 battle with the exact historical commands and result hash', () => {
    const state = historicalCombatFixture(verifier);
    const reloaded = migratePersistedRunState(
      JSON.parse(JSON.stringify(state)),
      RUN_SCHEMA_VERSION,
    );
    const resumed = resolveHistoricalAuthorityCombat(reloaded, 'historical-player', verifier);
    expect(resumed.authorityAttempt.commands.map((command) => command.kind)).toEqual([
      'move_node',
      'resolve_combat',
      'resolve_node',
    ]);
    const combat = verifier.replay(
      historicalAuthorityAttempt(resumed.authorityAttempt),
      historicalAuthorityCommands(resumed.authorityAttempt).slice(0, 2),
    );
    expect(createHash('sha256').update(JSON.stringify(combat)).digest('hex')).toBe(
      'd5fdee50c4d835ff3f42f94ca65d9ae348d226884ec83a3770f22df6b4704986',
    );
    const projected = {
      ...reloaded,
      ...projectHistoricalCombat(reloaded, resumed.authorityAttempt, resumed.result),
    };
    const restored = migratePersistedRunState(
      JSON.parse(JSON.stringify(projected)),
      RUN_SCHEMA_VERSION,
    );
    expect(restored.team).toEqual(projected.team);
    expect(restored.ledger).toEqual(resumed.result.snapshot.ledger);
    expect(restored.inventory).toEqual(resumed.result.snapshot.inventory);
    expect(restored.gold).toBe(resumed.result.snapshot.gold);
    expect(restored.frontierNodeIds).toEqual(resumed.result.snapshot.expectedNodeIds);
    expect(restored.authorityAttempt).toEqual(resumed.authorityAttempt);
    expect(restored.combatRecoveryRequired).toBe(false);
    // An interrupted route transition does not grant the combat or its rewards twice.
    const retried = resolveHistoricalAuthorityCombat(restored, 'historical-player', verifier);
    expect(retried).toEqual(resumed);
  });

  it('continues through later encounters after reload until the frozen engine ends the run', () => {
    let state = historicalCombatFixture(verifier);
    let result = verifier.replay(
      historicalAuthorityAttempt(state.authorityAttempt!),
      historicalAuthorityCommands(state.authorityAttempt!),
    );
    let combats = 0;
    const append = (command: RunCommandInput) => {
      const next = appendRunAuthorityCommand(state, 'historical-player', command);
      if (!next.success || !next.authorityAttempt)
        throw new Error('Unable to prepare fixture command');
      result = verifier.replay(
        historicalAuthorityAttempt(next.authorityAttempt),
        historicalAuthorityCommands(next.authorityAttempt),
      );
      state = { ...state, ...projectHistoricalCombat(state, next.authorityAttempt, result) };
    };
    for (let steps = 0; steps < 300 && !result.snapshot.terminal; steps++) {
      const pending = result.snapshot.pendingEncounter;
      if (!pending) {
        const championId = result.snapshot.pendingSpellUpgradeChampionIds[0];
        if (championId) {
          const upgraded = (['Q', 'W', 'E', 'R'] as const).some((slot) => {
            try {
              append({ kind: 'upgrade_spell', championId, slot });
              return true;
            } catch {
              return false;
            }
          });
          if (!upgraded) throw new Error('Frozen spell upgrade has no legal choice');
          continue;
        }
        const augmentId = result.snapshot.pendingAugmentIds[0];
        if (augmentId) {
          append({ kind: 'choose_augment', augmentId });
          continue;
        }
        const next = result.snapshot.expectedNodeIds[0];
        if (!next) throw new Error('Historical run has no continuation');
        append({ kind: 'move_node', nodeId: next });
      } else if (['combat', 'elite', 'boss'].includes(pending.nodeType)) {
        state = migratePersistedRunState(JSON.parse(JSON.stringify(state)), RUN_SCHEMA_VERSION);
        const resumed = resolveHistoricalAuthorityCombat(state, 'historical-player', verifier);
        result = resumed.result;
        state = { ...state, ...projectHistoricalCombat(state, resumed.authorityAttempt, result) };
        combats++;
      } else if (pending.nodeType === 'treasure' && !pending.claimed) {
        append({ kind: 'treasure', nodeId: pending.nodeId });
      } else {
        // Other noncombat encounters can be skipped without applying newer rules.
        append({ kind: 'resolve_node', nodeId: pending.nodeId });
      }
    }
    expect(combats).toBeGreaterThan(1);
    expect(result.snapshot.terminal).toBe(true);
    const frozen = verifier.replay(
      historicalAuthorityAttempt(state.authorityAttempt!),
      historicalAuthorityCommands(state.authorityAttempt!),
    );
    expect(result).toEqual(frozen);
    expect(state.team.map((member) => member.currentHp)).toEqual(
      frozen.snapshot.team.map((member) => member.currentHp),
    );
    expect(state.ledger).toEqual(frozen.snapshot.ledger);
  });

  it.each(['wrong-owner', null])(
    'does not mutate the journal for an account mismatch (%s)',
    (owner) => {
      const state = historicalCombatFixture(verifier);
      const saved = structuredClone(state);
      expect(() => resolveHistoricalAuthorityCombat(state, owner, verifier)).toThrow();
      expect(state).toEqual(saved);
    },
  );

  it('does not publish a command or partial rewards when frozen replay rejects it', () => {
    const state = historicalCombatFixture(verifier);
    const saved = structuredClone(state);
    const failing = {
      ...verifier,
      replay: vi
        .fn(verifier.replay)
        .mockImplementationOnce(verifier.replay)
        .mockImplementationOnce(() => {
          throw new Error('frozen rejection');
        }),
    };
    expect(() => resolveHistoricalAuthorityCombat(state, 'historical-player', failing)).toThrow(
      'frozen rejection',
    );
    expect(state).toEqual(saved);
  });

  it('refuses an engine mismatch before applying any newer gameplay', () => {
    const state = historicalCombatFixture(verifier);
    expect(() =>
      resolveHistoricalAuthorityCombat(state, 'historical-player', {
        ...verifier,
        engineVersion: 'run-engine-0.3.0',
      }),
    ).toThrow();
  });
});
