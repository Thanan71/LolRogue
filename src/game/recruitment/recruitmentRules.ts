export const RECRUITMENT_GOLD_COST_RANGE = Object.freeze({ min: 150, max: 300 });

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
