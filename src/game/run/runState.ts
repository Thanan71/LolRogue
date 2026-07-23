import type { TeamMember } from '@/types/run';

export function getSurvivingChampionIds(team: TeamMember[]): string[] {
  return team
    .filter((member) => member.currentHp === undefined || member.currentHp > 0)
    .map((member) => member.championId);
}

export function shouldApplyRunRewards(
  rewardsApplied: boolean,
  championCount: number,
  wavesCompleted: number,
): boolean {
  return !rewardsApplied && championCount > 0 && wavesCompleted > 0;
}

export function canClaimEncounterReward(
  currentNodeId: string | null,
  pendingNodeId: string | null,
  claimedNodeIds: readonly string[],
): boolean {
  return Boolean(
    currentNodeId &&
      pendingNodeId &&
      currentNodeId === pendingNodeId &&
      !claimedNodeIds.includes(currentNodeId),
  );
}
