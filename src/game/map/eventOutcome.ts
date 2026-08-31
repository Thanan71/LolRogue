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

const UNAFFORDABLE_OUTCOME_DESCRIPTION =
  'You cannot afford the selected outcome, so nothing happens.';

/**
 * Selects from the original weights, then neutralizes a selected cost that the
 * player cannot afford. This keeps low-gold runs from rerolling bad outcomes
 * into positive ones while still preventing the balance from going negative.
 */
export function resolveAffordableEventOutcome(
  outcomes: readonly EventOutcome[],
  availableGold: number,
  rand: () => number = Math.random,
): EventOutcome {
  const selected = resolveEventOutcome(outcomes, rand);
  const spendableGold = Number.isFinite(availableGold) ? Math.max(0, availableGold) : 0;
  const selectedCost = Math.abs(selected.goldAmount ?? 0);

  if (selected.type !== 'gold_cost' || selectedCost <= spendableGold) return selected;

  return {
    type: 'nothing',
    weight: selected.weight,
    description: UNAFFORDABLE_OUTCOME_DESCRIPTION,
  };
}
