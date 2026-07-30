import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { MAX_TEAM_SIZE, type TeamMember } from '@/types/run';

export type TeamRuleFailure =
  | 'invalid_team_size'
  | 'team_full'
  | 'duplicate_champion'
  | 'unknown_champion'
  | 'unsupported_champion';

export type TeamRuleResult<T> =
  | { valid: true; value: T }
  | { valid: false; code: TeamRuleFailure; message: string };

const SUPPORTED_CHAMPION_IDS = new Set(implementedChampions.map((champion) => champion.id));

export function resolveSupportedChampionId(championId: unknown): TeamRuleResult<string> {
  if (typeof championId !== 'string' || championId.trim().length === 0) {
    return {
      valid: false,
      code: 'unknown_champion',
      message: 'The team contains an invalid champion identifier.',
    };
  }
  const champion = championDB.getById(championId);
  if (!champion) {
    return {
      valid: false,
      code: 'unknown_champion',
      message: `Unknown champion: ${championId}.`,
    };
  }
  if (!SUPPORTED_CHAMPION_IDS.has(champion.id)) {
    return {
      valid: false,
      code: 'unsupported_champion',
      message: `Unsupported champion: ${championId}.`,
    };
  }
  return { valid: true, value: champion.id };
}

export function validateTeamChampionIds(
  championIds: readonly unknown[],
  options: { minimumSize?: number; maximumSize?: number } = {},
): TeamRuleResult<string[]> {
  const minimumSize = options.minimumSize ?? 1;
  const maximumSize = Math.min(options.maximumSize ?? MAX_TEAM_SIZE, MAX_TEAM_SIZE);
  if (championIds.length < minimumSize || championIds.length > maximumSize) {
    return {
      valid: false,
      code: 'invalid_team_size',
      message: `The team must contain between ${minimumSize} and ${maximumSize} champions.`,
    };
  }

  const canonicalIds: string[] = [];
  const seen = new Set<string>();
  for (const requestedId of championIds) {
    const resolved = resolveSupportedChampionId(requestedId);
    if (!resolved.valid) return resolved;
    if (seen.has(resolved.value)) {
      return {
        valid: false,
        code: 'duplicate_champion',
        message: `Champion ${resolved.value} can only appear once in the team.`,
      };
    }
    seen.add(resolved.value);
    canonicalIds.push(resolved.value);
  }
  return { valid: true, value: canonicalIds };
}

export function validateTeamAddition(
  team: readonly Pick<TeamMember, 'championId'>[],
  championId: unknown,
): TeamRuleResult<string> {
  if (team.length >= MAX_TEAM_SIZE) {
    return { valid: false, code: 'team_full', message: 'The team is already full.' };
  }
  const resolved = resolveSupportedChampionId(championId);
  if (!resolved.valid) return resolved;
  if (team.some((member) => member.championId === resolved.value)) {
    return {
      valid: false,
      code: 'duplicate_champion',
      message: `Champion ${resolved.value} is already on the team.`,
    };
  }
  return resolved;
}

export function normalizeTeamMembers(team: unknown): TeamMember[] {
  if (!Array.isArray(team)) return [];
  const normalized: TeamMember[] = [];
  const seen = new Set<string>();
  for (const candidate of team) {
    if (normalized.length >= MAX_TEAM_SIZE || !candidate || typeof candidate !== 'object') continue;
    const member = candidate as Partial<TeamMember>;
    const resolved = resolveSupportedChampionId(member.championId);
    if (!resolved.valid || seen.has(resolved.value)) continue;
    seen.add(resolved.value);

    const level = Number.isSafeInteger(member.level)
      ? Math.max(1, Math.min(18, member.level as number))
      : 1;
    const currentXp =
      Number.isFinite(member.currentXp) && (member.currentXp as number) >= 0
        ? Math.floor(member.currentXp as number)
        : 0;
    const statMultiplier =
      Number.isFinite(member.statMultiplier) &&
      (member.statMultiplier as number) >= 0.1 &&
      (member.statMultiplier as number) <= 10
        ? (member.statMultiplier as number)
        : 1;
    const finiteState = (value: unknown): number | undefined =>
      Number.isFinite(value) ? Math.max(0, value as number) : undefined;
    const statBoosts = Object.fromEntries(
      Object.entries(member.statBoosts ?? {}).filter(
        ([key, value]) => key.length > 0 && Number.isFinite(value),
      ),
    );

    normalized.push({
      championId: resolved.value,
      level,
      currentXp,
      statMultiplier,
      ...(finiteState(member.currentHp) === undefined
        ? {}
        : { currentHp: finiteState(member.currentHp) }),
      ...(finiteState(member.currentMp) === undefined
        ? {}
        : { currentMp: finiteState(member.currentMp) }),
      ...(Object.keys(statBoosts).length === 0 ? {} : { statBoosts }),
      ...(member.spellRanks ? { spellRanks: { ...member.spellRanks } } : {}),
    });
  }
  return normalized;
}
