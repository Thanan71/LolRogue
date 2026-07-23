export function getRecruitmentGoldCost(cost: number, success: boolean): number {
  return success ? Math.max(0, cost) : 0;
}
