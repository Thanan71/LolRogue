export const RECRUITMENT_GOLD_COST_RANGE = Object.freeze({ min: 150, max: 300 });
export const RECRUIT_STARTING_LEVEL_POLICY = 'max(runLevel + 1, medianTeamLevel - 1)';

interface RecruitmentTeamMember {
  readonly level?: number | null;
}

function normalizeChampionLevel(level: number | null | undefined): number {
  return typeof level === 'number' && Number.isFinite(level)
    ? Math.max(1, Math.min(18, Math.floor(level)))
    : 1;
}

export function getRecruitStartingLevel(
  runLevel: number,
  team: readonly RecruitmentTeamMember[],
): number {
  const normalizedRunLevel = normalizeChampionLevel(runLevel);
  const levels = team.map((member) => normalizeChampionLevel(member.level)).sort((a, b) => a - b);
  const middle = Math.floor(levels.length / 2);
  const medianTeamLevel =
    levels.length === 0
      ? 1
      : levels.length % 2 === 1
        ? levels[middle]!
        : (levels[middle - 1]! + levels[middle]!) / 2;

  return Math.min(18, Math.max(normalizedRunLevel + 1, Math.floor(medianTeamLevel - 1)));
}

export function normalizeRecruitmentGoldCost(cost: number): number {
  const finiteCost = Number.isFinite(cost) ? cost : RECRUITMENT_GOLD_COST_RANGE.min;
  const roundedCost = Math.round(finiteCost / 5) * 5;
  return Math.min(
    RECRUITMENT_GOLD_COST_RANGE.max,
    Math.max(RECRUITMENT_GOLD_COST_RANGE.min, roundedCost),
  );
}

export function getRecruitmentGoldCost(cost: number, success: boolean): number {
  return success ? normalizeRecruitmentGoldCost(cost) : 0;
}
