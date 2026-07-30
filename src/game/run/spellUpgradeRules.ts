import { championDB } from '@/data/championDatabase';
import type { SpellSlot } from '@/game/ChampionInstance';
import type { TeamMember } from '@/types/run';

export const SPELL_SLOTS: readonly SpellSlot[] = ['Q', 'W', 'E', 'R'];
type SpellProgressMember = Pick<TeamMember, 'championId' | 'level' | 'spellRanks'>;

function spellIndex(slot: SpellSlot): number {
  return SPELL_SLOTS.indexOf(slot);
}

export function getSpellMaximumRank(championId: string, slot: SpellSlot): number {
  return championDB.getById(championId)?.spells[spellIndex(slot)]?.maxRank ?? 0;
}

/**
 * The run starts every spell at rank 1. Basic spell ranks 2–5 unlock at
 * champion levels 3/5/7/9; ultimate ranks 2–3 unlock at levels 6/11.
 */
export function getSpellRankCap(championId: string, slot: SpellSlot, level: number): number {
  const maximum = getSpellMaximumRank(championId, slot);
  if (maximum < 1) return 0;
  const normalizedLevel = Math.max(1, Math.min(18, Math.floor(level)));
  const unlocked =
    slot === 'R'
      ? normalizedLevel >= 11
        ? 3
        : normalizedLevel >= 6
          ? 2
          : 1
      : 1 + Math.floor((normalizedLevel - 1) / 2);
  return Math.min(maximum, unlocked);
}

export function normalizeSpellRanks(
  championId: string,
  level: number,
  ranks: TeamMember['spellRanks'],
): NonNullable<TeamMember['spellRanks']> {
  return Object.fromEntries(
    SPELL_SLOTS.map((slot) => {
      const cap = Math.max(1, getSpellRankCap(championId, slot, level));
      const requested = ranks?.[slot];
      const rank = Number.isSafeInteger(requested)
        ? Math.max(1, Math.min(cap, requested as number))
        : 1;
      return [slot, rank];
    }),
  ) as NonNullable<TeamMember['spellRanks']>;
}

export function canUpgradeSpell(member: SpellProgressMember, slot: SpellSlot): boolean {
  const level = member.level ?? 1;
  const cap = getSpellRankCap(member.championId, slot, level);
  const rank = member.spellRanks?.[slot] ?? 1;
  return cap > 0 && rank < cap;
}

export function getAvailableSpellUpgradeCount(member: SpellProgressMember): number {
  return SPELL_SLOTS.reduce((total, slot) => {
    const rank = member.spellRanks?.[slot] ?? 1;
    return total + Math.max(0, getSpellRankCap(member.championId, slot, member.level ?? 1) - rank);
  }, 0);
}

export function normalizeSpellUpgradeQueue(
  team: readonly SpellProgressMember[],
  queue: readonly unknown[],
): string[] {
  const remainingByChampion = new Map(
    team.map((member) => [member.championId, getAvailableSpellUpgradeCount(member)]),
  );
  const normalized: string[] = [];
  for (const candidate of queue) {
    if (typeof candidate !== 'string') continue;
    const remaining = remainingByChampion.get(candidate) ?? 0;
    if (remaining <= 0) continue;
    normalized.push(candidate);
    remainingByChampion.set(candidate, remaining - 1);
  }
  return normalized;
}

export function queueSpellUpgradeChoices(
  team: readonly SpellProgressMember[],
  currentQueue: readonly string[],
  requestedChampionIds: readonly string[],
): string[] {
  return normalizeSpellUpgradeQueue(team, [...currentQueue, ...requestedChampionIds]);
}
