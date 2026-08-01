import type { EventOutcome } from './types';

/** Selects an outcome from the supplied deterministic/random source. */
export function resolveEventOutcome(
  outcomes: readonly EventOutcome[],
  rand: () => number = Math.random,
): EventOutcome {
  const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
  let roll = rand() * totalWeight;

  for (const outcome of outcomes) {
    roll -= outcome.weight;
    if (roll <= 0) return outcome;
  }

  return outcomes[outcomes.length - 1];
}

/** Filters unaffordable costs before selecting the canonical event outcome. */
export function resolveAffordableEventOutcome(
  outcomes: readonly EventOutcome[],
  availableGold: number,
  rand: () => number = Math.random,
): EventOutcome {
  const affordable = outcomes.filter(
    (outcome) =>
      outcome.type !== 'gold_cost' ||
      Math.abs(outcome.goldAmount ?? 0) <= Math.max(0, availableGold),
  );
  if (affordable.length > 0) return resolveEventOutcome(affordable, rand);
  return {
    type: 'nothing',
    weight: 1,
    description: 'You cannot afford any available outcome, so nothing happens.',
  };
}
