import { describe, expect, it } from 'vitest';
import { championDB } from '../src/data/championDatabase';
import { ChampionInstance } from '../src/game/ChampionInstance';
import { resolveAffordableEventOutcome } from '../src/game/map/eventOutcome';
import type { EventOutcome } from '../src/game/map/types';
import { getRecruitmentGoldCost } from '../src/game/recruitment/recruitmentRules';

describe('event and recruitment rules', () => {
  const weightedOutcomes = [
    { type: 'gold_cost', weight: 100, goldAmount: -200, description: 'Expensive' },
    { type: 'gold_reward', weight: 1, goldAmount: 25, description: 'Lucky find' },
  ] satisfies EventOutcome[];

  it('keeps the original weights and neutralizes a selected unaffordable cost', () => {
    const outcome = resolveAffordableEventOutcome(weightedOutcomes, 50, () => 0);

    expect(outcome).toEqual({
      type: 'nothing',
      weight: 100,
      description: 'You cannot afford the selected outcome, so nothing happens.',
    });
  });

  it('does not reroll into a positive outcome when the selected cost is unaffordable', () => {
    const outcome = resolveAffordableEventOutcome(weightedOutcomes, 50, () => 0.5);

    expect(outcome.type).toBe('nothing');
  });

  it('still selects a positive outcome from its original weight interval', () => {
    const outcome = resolveAffordableEventOutcome(weightedOutcomes, 50, () => 100.5 / 101);

    expect(outcome).toBe(weightedOutcomes[1]);
  });

  it('preserves an affordable selected cost', () => {
    const outcome = resolveAffordableEventOutcome(weightedOutcomes, 200, () => 0);

    expect(outcome).toBe(weightedOutcomes[0]);
  });

  it('returns a neutral no-op when the only selected outcome is unaffordable', () => {
    const outcome = resolveAffordableEventOutcome(
      [{ type: 'gold_cost', weight: 1, goldAmount: -200, description: 'Expensive' }],
      50,
      () => 0,
    );

    expect(outcome).toMatchObject({ type: 'nothing', weight: 1 });
  });

  it('charges recruitment gold only on success', () => {
    expect(getRecruitmentGoldCost(120, true)).toBe(150);
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
