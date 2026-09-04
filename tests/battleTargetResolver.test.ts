import { describe, expect, it } from 'vitest';
import { resolveBattleTargets } from '../src/game/battle/targetResolver';
import { TargetingType } from '../src/types/champion';

const combatants = [
  { id: 'P1', side: 'player' as const, isDefeated: false },
  { id: 'P2', side: 'player' as const, isDefeated: false },
  { id: 'P3', side: 'player' as const, isDefeated: true },
  { id: 'E1', side: 'enemy' as const, isDefeated: false },
  { id: 'E2', side: 'enemy' as const, isDefeated: false },
  { id: 'E3', side: 'enemy' as const, isDefeated: true },
];

describe('canonical battle target resolver', () => {
  it.each([
    [TargetingType.Self, undefined, ['P1']],
    [TargetingType.Ally, 'P2', ['P2']],
    [TargetingType.Allies, 'all', ['P1', 'P2']],
    [TargetingType.Enemy, 'E2', ['E2']],
    [TargetingType.Enemies, 'all', ['E1', 'E2']],
    [TargetingType.Area, 'E2', ['E2', 'E1']],
  ] as const)(
    'resolves %s through its canonical target matrix',
    (targeting, requested, expected) => {
      const result = resolveBattleTargets(combatants, 'P1', 'player', targeting, requested);

      expect(result.ok).toBe(true);
      expect(result.targets.map((target) => target.id)).toEqual(expected);
    },
  );

  it.each([
    [TargetingType.Enemy, undefined],
    [TargetingType.Enemy, 'all'],
    [TargetingType.Enemy, 'P2'],
    [TargetingType.Enemy, 'E3'],
    [TargetingType.Ally, 'E1'],
    [TargetingType.Ally, 'P3'],
    [TargetingType.Self, 'P2'],
    [TargetingType.Allies, 'P2'],
    [TargetingType.Area, undefined],
    [TargetingType.Area, 'all'],
    [TargetingType.Area, 'P2'],
  ] as const)('rejects a forged %s target payload (%s)', (targeting, requested) => {
    const result = resolveBattleTargets(combatants, 'P1', 'player', targeting, requested);

    expect(result.ok).toBe(false);
    expect(result.targets).toEqual([]);
  });

  it('exposes exactly the living legal targets used by the UI', () => {
    const result = resolveBattleTargets(combatants, 'P1', 'player', TargetingType.Ally, undefined);

    expect(result.requiresTarget).toBe(true);
    expect(result.legalTargets.map((target) => target.id)).toEqual(['P1', 'P2']);
  });
});
