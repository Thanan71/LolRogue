import { describe, expect, it } from 'vitest';
import { championDB } from '../src/data/championDatabase';
import { ChampionInstance } from '../src/game/ChampionInstance';
import { resolveAffordableEventOutcome } from '../src/game/map/EncounterManager';
import { getRecruitmentGoldCost } from '../src/game/recruitment/recruitmentRules';

describe('event and recruitment rules', () => {
  it('excludes event costs the player cannot pay', () => {
    const outcome = resolveAffordableEventOutcome(
      [
        { type: 'gold_cost', weight: 100, goldAmount: -200, description: 'Expensive' },
        { type: 'nothing', weight: 1, description: 'Safe fallback' },
      ],
      50,
      () => 0,
    );

    expect(outcome.type).toBe('nothing');
  });

  it('returns a safe no-op when every event outcome is unaffordable', () => {
    const outcome = resolveAffordableEventOutcome(
      [{ type: 'gold_cost', weight: 1, goldAmount: -200, description: 'Expensive' }],
      50,
      () => 0,
    );

    expect(outcome.type).toBe('nothing');
  });

  it('charges recruitment gold only on success', () => {
    expect(getRecruitmentGoldCost(120, true)).toBe(120);
    expect(getRecruitmentGoldCost(120, false)).toBe(0);
  });

  it('applies recruited champion quality to runtime stats', () => {
    const champion = championDB.getAll()[0];
    const normal = new ChampionInstance(champion, 1, 1).getStats();
    const exceptional = new ChampionInstance(champion, 1, 1.2).getStats();

    expect(exceptional.hp).toBeCloseTo(normal.hp * 1.2);
    expect(exceptional.attackDamage).toBeCloseTo(normal.attackDamage * 1.2);
  });
});
