import { describe, expect, it } from 'vitest';
import { ULTIMATE_UNLOCK_ROUND, isBattleActionUnlocked } from '@/game/battle/actionTimingRules';
import { ActionType } from '@/game/battle/types';

describe('battle action timing', () => {
  it('keeps ultimates locked until round three', () => {
    expect(ULTIMATE_UNLOCK_ROUND).toBe(3);
    expect(isBattleActionUnlocked(ActionType.SpellR, 1)).toBe(false);
    expect(isBattleActionUnlocked(ActionType.SpellR, 2)).toBe(false);
    expect(isBattleActionUnlocked(ActionType.SpellR, 3)).toBe(true);
  });

  it.each([ActionType.BasicAttack, ActionType.SpellQ, ActionType.SpellW, ActionType.SpellE])(
    'does not delay %s',
    (type) => {
      expect(isBattleActionUnlocked(type, 1)).toBe(true);
    },
  );
});
