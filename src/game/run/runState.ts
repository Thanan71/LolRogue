import type { TeamMember } from '@/types/run';

export function getSurvivingChampionIds(team: TeamMember[]): string[] {
  return team
    .filter((member) => member.currentHp === undefined || member.currentHp > 0)
    .map((member) => member.championId);
}
