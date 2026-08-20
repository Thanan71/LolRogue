import type { TeamMember } from '@/types/run';
import { addXp } from '@/utils/xpSystem';

export const POST_COMBAT_MP_RECOVERY_PERCENT = 0.25;

export interface PostCombatMemberUpdate {
  championId: string;
  currentHp: number;
  currentMp?: number;
  level: number;
  currentXp: number;
}

export interface PostCombatTeamResult {
  updates: PostCombatMemberUpdate[];
  pendingSpellUpgradeChampionIds: string[];
  levelsGained: number;
}

interface PostCombatFinalState {
  championId: string;
  currentHp: number;
  currentMp?: number;
}

/**
 * Canonical won-combat transition shared by the visible runtime and authority:
 * final resources → post-combat heal → XP/levels → one pending spell choice per level.
 */
export function resolvePostCombatTeam(input: {
  team: readonly TeamMember[];
  finalPlayerStates: readonly PostCombatFinalState[];
  xpPerChampion: number;
  healAfterBattlePercent: number;
  getPreLevelMaxHp: (member: TeamMember) => number;
  getPreLevelMaxMp: (member: TeamMember) => number;
  mpRecoveryPercent?: number;
}): PostCombatTeamResult {
  const finalByChampion = new Map(
    input.finalPlayerStates.map((state) => [state.championId, state] as const),
  );
  const pendingSpellUpgradeChampionIds: string[] = [];
  const updates = input.team.map((member) => {
    const currentLevel = member.level ?? 1;
    const xp = addXp(currentLevel, member.currentXp ?? 0, input.xpPerChampion);
    const finalState = finalByChampion.get(member.championId);
    const maxHp = Math.max(1, input.getPreLevelMaxHp(member));
    const maxMp = Math.max(0, input.getPreLevelMaxMp(member));
    const hpBeforeHeal = finalState?.currentHp ?? member.currentHp ?? maxHp;
    const mpBeforeRecovery = finalState?.currentMp ?? member.currentMp ?? maxMp;
    const recoveredMp = Math.round(
      maxMp * Math.max(0, input.mpRecoveryPercent ?? POST_COMBAT_MP_RECOVERY_PERCENT),
    );
    for (let index = 0; index < xp.levelsGained; index++) {
      pendingSpellUpgradeChampionIds.push(member.championId);
    }
    return {
      championId: member.championId,
      currentHp: Math.min(maxHp, hpBeforeHeal + maxHp * Math.max(0, input.healAfterBattlePercent)),
      currentMp: Math.min(maxMp, Math.max(0, mpBeforeRecovery) + recoveredMp),
      level: xp.newLevel,
      currentXp: xp.remainingXp,
    };
  });
  return {
    updates,
    pendingSpellUpgradeChampionIds,
    levelsGained: pendingSpellUpgradeChampionIds.length,
  };
}
