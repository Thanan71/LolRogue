export const TEAM_RUNE_BUDGET_VERSION = 1 as const;

export type TeamRuneAssignments = Readonly<Record<string, readonly string[]>>;

/**
 * Assigns every selected rune exactly once across the immutable starter team.
 * Team growth later in the run cannot multiply or move this budget.
 */
export function assignTeamRuneBudget(
  starterChampionIds: readonly string[],
  runeIds: readonly string[],
): TeamRuneAssignments {
  if (runeIds.length === 0) return {};
  if (starterChampionIds.length === 0) {
    throw new RangeError('A non-empty rune budget requires at least one starter champion.');
  }
  if (new Set(starterChampionIds).size !== starterChampionIds.length) {
    throw new RangeError('Rune owners must be unique starter champions.');
  }
  if (new Set(runeIds).size !== runeIds.length) {
    throw new RangeError('A team rune budget cannot contain duplicate runes.');
  }

  const assignments: Record<string, string[]> = Object.fromEntries(
    starterChampionIds.map((championId) => [championId, []]),
  );
  for (const [index, runeId] of runeIds.entries()) {
    const owner = starterChampionIds[index % starterChampionIds.length];
    if (owner) assignments[owner].push(runeId);
  }
  return assignments;
}
