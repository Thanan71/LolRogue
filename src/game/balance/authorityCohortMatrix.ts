import type { AuthorityDifficulty } from '@/game/authority/types';
import { MAX_TEAM_SIZE } from '@/types/run';
import type { BalancePolicy, BalancePolicyManifest, BalanceScenario } from './balancePolicy';

export interface AuthorityCohortTeamProfile {
  readonly id: string;
  readonly team: BalanceScenario['team'];
}

export interface AuthorityCohortMasteryProfile {
  readonly id: string;
  readonly masterySnapshot: BalanceScenario['masterySnapshot'];
}

export interface AuthorityCohortRuneProfile {
  readonly id: string;
  readonly runeIds: BalanceScenario['runeIds'];
}

export interface AuthorityCohortEnhancementProfile {
  readonly id: string;
  readonly enhancementSnapshot: BalanceScenario['enhancementSnapshot'];
}

export interface AuthorityCohortMatrixDefinition {
  readonly difficulties: readonly AuthorityDifficulty[];
  readonly teamProfiles: readonly AuthorityCohortTeamProfile[];
  readonly masteryProfiles: readonly AuthorityCohortMasteryProfile[];
  readonly runeProfiles: readonly AuthorityCohortRuneProfile[];
  readonly enhancementProfiles: readonly AuthorityCohortEnhancementProfile[];
  readonly policies: readonly BalancePolicy[];
}

export interface AuthorityCohortStratum {
  /** Human-readable cell identity, including every named profile and policy version. */
  readonly cellId: string;
  /** Stable semantic identity; profile renames do not alter it. */
  readonly fingerprint: string;
  readonly difficulty: AuthorityDifficulty;
  readonly team: {
    readonly size: number;
    readonly composition: ReadonlyArray<{
      readonly championId: string;
      readonly statMultiplier: number;
    }>;
  };
  readonly masterySnapshot: Readonly<Record<string, number>>;
  readonly runeIds: readonly string[];
  readonly enhancementSnapshot: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly policy: BalancePolicyManifest;
}

export interface AuthorityCohortCell {
  readonly id: string;
  readonly profiles: {
    readonly team: string;
    readonly mastery: string;
    readonly runes: string;
    readonly enhancements: string;
  };
  readonly scenario: BalanceScenario;
  readonly policy: BalancePolicy;
  readonly stratum: AuthorityCohortStratum;
}

const DIFFICULTY_ORDER = {
  easy: 0,
  normal: 1,
  hard: 2,
} satisfies Record<AuthorityDifficulty, number>;
const PROFILE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,79})$/;

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function hash32(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fingerprint(value: unknown): string {
  const serialized = stableSerialize(value);
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => hash32(serialized, seed))
    .join('');
}

function cloneNumberRecord(source: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, source[key] ?? 0]),
  );
}

function cloneEnhancementSnapshot(
  source: BalanceScenario['enhancementSnapshot'],
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((championId) => [championId, cloneNumberRecord(source[championId] ?? {})]),
  );
}

function cloneTeam(team: BalanceScenario['team']): Array<{
  championId: string;
  statMultiplier: number;
}> {
  return team.map((member) => ({
    championId: member.championId,
    statMultiplier: member.statMultiplier ?? 1,
  }));
}

function cloneManifest(manifest: BalancePolicyManifest): BalancePolicyManifest {
  return { id: manifest.id, version: manifest.version };
}

export function createAuthorityCohortStratum(
  scenario: BalanceScenario,
  policy: BalancePolicyManifest,
): AuthorityCohortStratum {
  const team = cloneTeam(scenario.team);
  const masterySnapshot = cloneNumberRecord(scenario.masterySnapshot);
  const runeIds = [...scenario.runeIds];
  const enhancementSnapshot = cloneEnhancementSnapshot(scenario.enhancementSnapshot);
  const policyManifest = cloneManifest(policy);
  const semanticDimensions = {
    difficulty: scenario.difficulty,
    team,
    masterySnapshot,
    runeIds,
    enhancementSnapshot,
    policy: policyManifest,
  };

  return {
    cellId: scenario.id,
    fingerprint: fingerprint(semanticDimensions),
    difficulty: scenario.difficulty,
    team: {
      size: team.length,
      composition: team,
    },
    masterySnapshot,
    runeIds,
    enhancementSnapshot,
    policy: policyManifest,
  };
}

function assertProfileId(id: string, axis: string): void {
  if (!PROFILE_ID_PATTERN.test(id)) {
    throw new TypeError(
      `${axis} profile id "${id}" must use 1-80 lowercase letters, digits, dots, underscores or dashes.`,
    );
  }
}

function sortProfiles<T extends { readonly id: string }>(
  profiles: readonly T[],
  axis: string,
): T[] {
  if (profiles.length === 0) throw new RangeError(`${axis} profiles must not be empty.`);
  const sorted = [...profiles].sort((left, right) => left.id.localeCompare(right.id));
  const seen = new Set<string>();
  for (const profile of sorted) {
    assertProfileId(profile.id, axis);
    if (seen.has(profile.id))
      throw new RangeError(`${axis} profile "${profile.id}" is duplicated.`);
    seen.add(profile.id);
  }
  return sorted;
}

function validateTeamProfiles(profiles: readonly AuthorityCohortTeamProfile[]): void {
  for (const profile of profiles) {
    if (profile.team.length < 1 || profile.team.length > MAX_TEAM_SIZE) {
      throw new RangeError(
        `Team profile "${profile.id}" must contain between 1 and ${MAX_TEAM_SIZE} champions.`,
      );
    }
    const championIds = new Set<string>();
    for (const member of profile.team) {
      if (!member.championId || championIds.has(member.championId)) {
        throw new RangeError(
          `Team profile "${profile.id}" contains an invalid duplicate champion.`,
        );
      }
      if (
        member.statMultiplier !== undefined &&
        (!Number.isFinite(member.statMultiplier) || member.statMultiplier <= 0)
      ) {
        throw new RangeError(`Team profile "${profile.id}" has an invalid stat multiplier.`);
      }
      championIds.add(member.championId);
    }
  }
}

function sortedDifficulties(difficulties: readonly AuthorityDifficulty[]): AuthorityDifficulty[] {
  if (difficulties.length === 0) throw new RangeError('Difficulties must not be empty.');
  const seen = new Set<AuthorityDifficulty>();
  for (const difficulty of difficulties) {
    if (!Object.prototype.hasOwnProperty.call(DIFFICULTY_ORDER, difficulty)) {
      throw new TypeError(`Unknown authority difficulty "${difficulty}".`);
    }
    if (seen.has(difficulty)) throw new RangeError(`Difficulty "${difficulty}" is duplicated.`);
    seen.add(difficulty);
  }
  return [...difficulties].sort((left, right) => DIFFICULTY_ORDER[left] - DIFFICULTY_ORDER[right]);
}

function sortedPolicies(policies: readonly BalancePolicy[]): BalancePolicy[] {
  if (policies.length === 0) throw new RangeError('Policies must not be empty.');
  const sorted = [...policies].sort(
    (left, right) =>
      left.manifest.id.localeCompare(right.manifest.id) ||
      left.manifest.version - right.manifest.version,
  );
  const seen = new Set<string>();
  for (const policy of sorted) {
    assertProfileId(policy.manifest.id, 'Policy');
    if (!Number.isSafeInteger(policy.manifest.version) || policy.manifest.version < 1) {
      throw new TypeError(`Policy "${policy.manifest.id}" has an invalid version.`);
    }
    const key = `${policy.manifest.id}@${policy.manifest.version}`;
    if (seen.has(key)) throw new RangeError(`Policy "${key}" is duplicated.`);
    seen.add(key);
  }
  return sorted;
}

function createCellId(input: {
  difficulty: AuthorityDifficulty;
  team: AuthorityCohortTeamProfile;
  mastery: AuthorityCohortMasteryProfile;
  runes: AuthorityCohortRuneProfile;
  enhancements: AuthorityCohortEnhancementProfile;
  policy: BalancePolicyManifest;
}): string {
  return [
    `difficulty=${input.difficulty}`,
    `team=${input.team.id}`,
    `size=${input.team.team.length}`,
    `mastery=${input.mastery.id}`,
    `runes=${input.runes.id}`,
    `enhancements=${input.enhancements.id}`,
    `policy=${input.policy.id}@${input.policy.version}`,
  ].join('|');
}

/**
 * Builds the complete deterministic cross-product used by balance runs. Each cell keeps
 * team size/composition and every meta input separate so later reports cannot hide a
 * weak cohort inside an aggregate with a different starting budget.
 */
export function createAuthorityCohortMatrix(
  definition: AuthorityCohortMatrixDefinition,
): readonly AuthorityCohortCell[] {
  const difficulties = sortedDifficulties(definition.difficulties);
  const teamProfiles = sortProfiles(definition.teamProfiles, 'Team');
  const masteryProfiles = sortProfiles(definition.masteryProfiles, 'Mastery');
  const runeProfiles = sortProfiles(definition.runeProfiles, 'Rune');
  const enhancementProfiles = sortProfiles(definition.enhancementProfiles, 'Enhancement');
  const policies = sortedPolicies(definition.policies);
  validateTeamProfiles(teamProfiles);

  const cells: AuthorityCohortCell[] = [];
  const fingerprints = new Map<string, string>();
  for (const difficulty of difficulties) {
    for (const team of teamProfiles) {
      for (const mastery of masteryProfiles) {
        for (const runes of runeProfiles) {
          for (const enhancements of enhancementProfiles) {
            for (const policy of policies) {
              const id = createCellId({
                difficulty,
                team,
                mastery,
                runes,
                enhancements,
                policy: policy.manifest,
              });
              const scenario: BalanceScenario = {
                id,
                difficulty,
                team: cloneTeam(team.team),
                runeIds: [...runes.runeIds],
                masterySnapshot: cloneNumberRecord(mastery.masterySnapshot),
                enhancementSnapshot: cloneEnhancementSnapshot(enhancements.enhancementSnapshot),
              };
              const stratum = createAuthorityCohortStratum(scenario, policy.manifest);
              const duplicate = fingerprints.get(stratum.fingerprint);
              if (duplicate) {
                throw new RangeError(
                  `Authority cohort cells "${duplicate}" and "${id}" have identical dimensions.`,
                );
              }
              fingerprints.set(stratum.fingerprint, id);
              cells.push({
                id,
                profiles: {
                  team: team.id,
                  mastery: mastery.id,
                  runes: runes.id,
                  enhancements: enhancements.id,
                },
                scenario,
                policy,
                stratum,
              });
            }
          }
        }
      }
    }
  }
  return cells;
}
