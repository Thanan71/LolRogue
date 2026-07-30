import { describe, expect, it } from 'vitest';
import {
  decodeCombatActionTrace,
  encodeCombatActionTrace,
  MAX_COMBAT_ACTIONS,
} from '@/game/battle/actionTrace';
import { ActionType } from '@/game/battle/types';

describe('combat action trace', () => {
  it('round-trips compact manual actions and targets', () => {
    const trace = [
      { type: ActionType.SpellQ, targetId: 'enemy:Garen:0', automatic: false },
      { type: ActionType.SpellR, automatic: false },
      { type: ActionType.BasicAttack, targetId: 'enemy:Annie:1', automatic: true },
    ];

    const encoded = encodeCombatActionTrace(trace);

    expect(encoded.length).toBeLessThan(100);
    expect(decodeCombatActionTrace(encoded)).toEqual(trace);
  });

  it('rejects malformed and oversized traces', () => {
    expect(decodeCombatActionTrace('{"action":"q"}')).toBeNull();
    expect(decodeCombatActionTrace('[["unknown",null]]')).toBeNull();
    expect(() =>
      encodeCombatActionTrace(
        Array.from({ length: MAX_COMBAT_ACTIONS + 1 }, () => ({
          type: ActionType.BasicAttack,
          automatic: true,
        })),
      ),
    ).toThrow('combat_action_trace_too_long');
  });
});
