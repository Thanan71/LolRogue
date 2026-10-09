import { getRecruitStartingLevel } from '@/game/recruitment/recruitmentRules';
import { buildRunPlayerTeam, type RunCombatantRules } from '@/game/run/runCombatant';
import type { TeamMember } from '@/types/run';
import type { CalculatedStats } from '@/utils/champion';

export interface RecruitPreview {
  readonly level: number;
  readonly stats: CalculatedStats;
}

/** Preview the new member with the same progression and bonuses as combat. */
export function getRecruitPreview(
  championId: string,
  runLevel: number,
  team: readonly TeamMember[],
  rules: RunCombatantRules,
  statMultiplier = 1,
): RecruitPreview | null {
  const level = getRecruitStartingLevel(runLevel, team);
  const [instance] = buildRunPlayerTeam([{ championId, level, statMultiplier }], rules);
  return instance ? { level, stats: instance.getEnhancedStats() } : null;
}
