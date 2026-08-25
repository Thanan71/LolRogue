import type { AuthorityRunAttempt, AuthorityRunCommand } from '@/game/authority/types';
import { AugmentTier, ItemRarity } from '@/types/inventory';
import { BIOMES, type Biome } from '@/types/run';
import type { AuthorityCohortResult, AuthorityCohortRun } from './authorityCohort';
import {
  type AuthorityCohortReport,
  calculateAuthorityCohortPercentiles,
} from './authorityCohortReport';
import type { BalancePolicyManifest } from './balancePolicy';

export const LEGACY_AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION = 2 as const;
export type AuthorityCohortBaselineSchemaVersion =
  | typeof LEGACY_AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION
  | typeof AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION;

export const LEGACY_AUTHORITY_COHORT_BASELINE_METRIC_NAMES = [
  'outcome.winRate',
  'progression.waves.p10',
  'progression.waves.p50',
  'progression.waves.p90',
  'progression.biomes.p10',
  'progression.biomes.p50',
  'progression.biomes.p90',
  'progression.rounds.p10',
  'progression.rounds.p50',
  'progression.rounds.p90',
  'deaths.rate',
  'deaths.unattributedRate',
  'resources.hp.initialMeanRatio',
  'resources.hp.finalMeanRatio',
  'resources.mp.initialMeanRatio',
  'resources.mp.finalMeanRatio',
  'combat.encountersPerRun',
  'combat.roundsPerRun',
  'combat.player.hpDamagePerRound',
  'combat.player.shieldDamagePerRound',
  'combat.player.healingPerRound',
  'combat.player.crowdControlApplicationsPerRound',
  'combat.player.crowdControlDurationPerRound',
  'combat.player.actionsLostPerRound',
  'combat.player.actionsSuppressedPerRound',
  'combat.enemy.hpDamagePerRound',
  'combat.enemy.shieldDamagePerRound',
  'combat.enemy.healingPerRound',
  'combat.enemy.crowdControlApplicationsPerRound',
  'combat.enemy.crowdControlDurationPerRound',
  'combat.enemy.actionsLostPerRound',
  'combat.enemy.actionsSuppressedPerRound',
  'economy.goldEarned.p10',
  'economy.goldEarned.p50',
  'economy.goldEarned.p90',
  'economy.goldEarned.mean',
  'economy.goldSpent.p10',
  'economy.goldSpent.p50',
  'economy.goldSpent.p90',
  'economy.goldSpent.mean',
  'economy.finalGold.p10',
  'economy.finalGold.p50',
  'economy.finalGold.p90',
  'economy.finalGold.mean',
  'shops.visitsPerRun',
  'shops.visitsWithAnyAffordableOfferRate',
  'shops.allOffers.affordableRate',
  'shops.itemOffers.affordableRate',
  'shops.recruitOffers.affordableRate',
  'purchases.commandsPerRun',
  'purchases.completionRate',
  'purchases.goldSpentPerRun',
  'recruitments.commandsPerRun',
  'recruitments.successRate',
  'recruitments.eventRecruitsPerRun',
  'recruitments.goldSpentPerRun',
  'drops.totalPerRun',
  'drops.unknownItemsPerRun',
  'drops.blockedByCapacityPerRun',
  'drops.rarity.commonPerRun',
  'drops.rarity.uncommonPerRun',
  'drops.rarity.rarePerRun',
  'drops.rarity.epicPerRun',
  'drops.rarity.legendaryPerRun',
  'drops.tier.1PerRun',
  'drops.tier.2PerRun',
  'drops.tier.3PerRun',
  'augments.choicesPerRun',
  'augments.unknownChoicesPerRun',
  'augments.tier.silverPerRun',
  'augments.tier.goldPerRun',
  'augments.tier.prismaticPerRun',
] as const;

export const AUTHORITY_COHORT_BASELINE_METRIC_NAMES = [
  ...LEGACY_AUTHORITY_COHORT_BASELINE_METRIC_NAMES,
  'combat.player.shieldingAbsorbedPerRound',
  'combat.player.manaSpentPerRound',
  'combat.enemy.shieldingAbsorbedPerRound',
  'combat.enemy.manaSpentPerRound',
] as const;

export type AuthorityCohortBaselineMetricName =
  (typeof AUTHORITY_COHORT_BASELINE_METRIC_NAMES)[number];
type LegacyAuthorityCohortBaselineMetricName =
  (typeof LEGACY_AUTHORITY_COHORT_BASELINE_METRIC_NAMES)[number];

export type AuthorityCohortBaselineMetrics = Readonly<
  Record<LegacyAuthorityCohortBaselineMetricName, number> &
    Partial<Record<AuthorityCohortBaselineMetricName, number>>
>;

export interface AuthorityCohortBaselineIdentity {
  readonly engineVersion: string;
  readonly contentHash: string;
  readonly balanceModelVersion: number;
  readonly policy: BalancePolicyManifest;
}

export interface AuthorityCohortBaselineDeathLocation {
  readonly biome: Biome;
  readonly encounterId: string;
  readonly count: number;
  readonly share: number;
}

export interface AuthorityCohortBaselineReport {
  readonly scenarioId: string;
  readonly stratumFingerprint: string;
  readonly sampleSize: number;
  readonly metrics: AuthorityCohortBaselineMetrics;
  readonly deathLocations: readonly AuthorityCohortBaselineDeathLocation[];
}

export interface AuthorityCohortBaselineEntry {
  readonly identity: AuthorityCohortBaselineIdentity;
  readonly source: {
    readonly kind: 'authority-cohort-matrix';
    readonly seeds: readonly number[];
    readonly cellCount: number;
  };
  readonly reports: readonly AuthorityCohortBaselineReport[];
}

export interface AuthorityCohortBaselineDocument {
  readonly schemaVersion: AuthorityCohortBaselineSchemaVersion;
  readonly entries: Readonly<Record<string, AuthorityCohortBaselineEntry>>;
}

export interface AuthorityCohortMetricDelta {
  readonly metric: AuthorityCohortBaselineMetricName;
  readonly baseline: number;
  readonly current: number;
  readonly absoluteDelta: number;
  readonly relativeDelta: number | null;
}

export interface AuthorityCohortDeathLocationDelta {
  readonly biome: Biome;
  readonly encounterId: string;
  readonly baselineShare: number;
  readonly currentShare: number;
  readonly shareDelta: number;
}

export interface AuthorityCohortReportComparison {
  readonly scenarioId: string;
  readonly stratumFingerprint: string;
  readonly baselineSampleSize: number;
  readonly currentSampleSize: number;
  readonly metrics: readonly AuthorityCohortMetricDelta[];
  readonly deathLocations: readonly AuthorityCohortDeathLocationDelta[];
}

export interface AuthorityCohortBaselineComparison {
  readonly baselineKey: string;
  readonly reports: readonly AuthorityCohortReportComparison[];
}

export interface AuthorityCohortTraceArtifact {
  readonly scenarioId: string;
  readonly stratumFingerprint: string;
  readonly seed: number;
  readonly reasons: readonly string[];
  readonly attempt: AuthorityRunAttempt;
  readonly trace: readonly AuthorityRunCommand[];
}

export interface AuthorityCohortTraceArtifactBundle {
  readonly schemaVersion: typeof AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION;
  readonly baselineKey: string;
  readonly traces: readonly AuthorityCohortTraceArtifact[];
}

export class AuthorityCohortBaselineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorityCohortBaselineValidationError';
  }
}

export class AuthorityCohortBaselineMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorityCohortBaselineMismatchError';
  }
}

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,79})$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const STRATUM_FINGERPRINT_PATTERN = /^[0-9a-f]{32}$/;
const BOUNDED_RATE_METRICS = new Set<AuthorityCohortBaselineMetricName>([
  'outcome.winRate',
  'deaths.rate',
  'deaths.unattributedRate',
  'resources.hp.initialMeanRatio',
  'resources.hp.finalMeanRatio',
  'resources.mp.initialMeanRatio',
  'resources.mp.finalMeanRatio',
  'shops.visitsWithAnyAffordableOfferRate',
  'shops.allOffers.affordableRate',
  'shops.itemOffers.affordableRate',
  'shops.recruitOffers.affordableRate',
  'purchases.completionRate',
  'recruitments.successRate',
]);

function invalid(path: string, message: string): never {
  throw new AuthorityCohortBaselineValidationError(`${path}: ${message}`);
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'expected an object.');
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    invalid(path, `expected exactly keys ${canonical.join(', ')}.`);
  }
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0)
    invalid(path, 'expected a non-empty string.');
  return value;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(path, 'expected a finite number.');
  }
  return value;
}

function readSafeInteger(value: unknown, path: string, minimum = Number.MIN_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    invalid(path, `expected a safe integer >= ${minimum}.`);
  }
  return value as number;
}

function readRate(value: unknown, path: string): number {
  const rate = readFiniteNumber(value, path);
  if (rate < 0 || rate > 1) invalid(path, 'expected a rate between 0 and 1.');
  return rate;
}

function parsePolicy(value: unknown, path: string): BalancePolicyManifest {
  const policy = readObject(value, path);
  assertExactKeys(policy, ['id', 'version'], path);
  const id = readString(policy.id, `${path}.id`);
  if (!ID_PATTERN.test(id)) invalid(`${path}.id`, 'has an invalid identifier.');
  return { id, version: readSafeInteger(policy.version, `${path}.version`, 1) };
}

function parseIdentity(value: unknown, path: string): AuthorityCohortBaselineIdentity {
  const identity = readObject(value, path);
  assertExactKeys(
    identity,
    ['engineVersion', 'contentHash', 'balanceModelVersion', 'policy'],
    path,
  );
  const engineVersion = readString(identity.engineVersion, `${path}.engineVersion`);
  if (!ID_PATTERN.test(engineVersion)) {
    invalid(`${path}.engineVersion`, 'has an invalid identifier.');
  }
  const contentHash = readString(identity.contentHash, `${path}.contentHash`);
  if (!CONTENT_HASH_PATTERN.test(contentHash)) {
    invalid(`${path}.contentHash`, 'expected a lowercase 64-character SHA-256 hash.');
  }
  return {
    engineVersion,
    contentHash,
    balanceModelVersion: readSafeInteger(
      identity.balanceModelVersion,
      `${path}.balanceModelVersion`,
      1,
    ),
    policy: parsePolicy(identity.policy, `${path}.policy`),
  };
}

export function createAuthorityCohortBaselineKey(
  identity: AuthorityCohortBaselineIdentity,
): string {
  const parsed = parseIdentity(identity, 'identity');
  return [
    `engine=${parsed.engineVersion}`,
    `content=${parsed.contentHash}`,
    `model=${parsed.balanceModelVersion}`,
    `policy=${parsed.policy.id}@${parsed.policy.version}`,
  ].join('|');
}

function per(dividend: number, divisor: number): number {
  return divisor === 0 ? 0 : dividend / divisor;
}

function createMetrics(report: AuthorityCohortReport): AuthorityCohortBaselineMetrics {
  const runs = report.sampleSize;
  const rounds = report.combat.rounds;
  const player = report.combat.bySide.player;
  const enemy = report.combat.bySide.enemy;
  return {
    'outcome.winRate': report.outcome.winRate,
    'progression.waves.p10': report.progression.waves.p10,
    'progression.waves.p50': report.progression.waves.p50,
    'progression.waves.p90': report.progression.waves.p90,
    'progression.biomes.p10': report.progression.biomes.p10,
    'progression.biomes.p50': report.progression.biomes.p50,
    'progression.biomes.p90': report.progression.biomes.p90,
    'progression.rounds.p10': report.progression.rounds.p10,
    'progression.rounds.p50': report.progression.rounds.p50,
    'progression.rounds.p90': report.progression.rounds.p90,
    'deaths.rate': per(report.deaths.total, runs),
    'deaths.unattributedRate': per(report.deaths.unattributed, runs),
    'resources.hp.initialMeanRatio': report.resources.hp.initialMeanRatio,
    'resources.hp.finalMeanRatio': report.resources.hp.finalMeanRatio,
    'resources.mp.initialMeanRatio': report.resources.mp.initialMeanRatio,
    'resources.mp.finalMeanRatio': report.resources.mp.finalMeanRatio,
    'combat.encountersPerRun': per(report.combat.encounters, runs),
    'combat.roundsPerRun': per(rounds, runs),
    'combat.player.hpDamagePerRound': player.hpDamagePerRound,
    'combat.player.shieldDamagePerRound': player.shieldDamagePerRound,
    'combat.player.healingPerRound': player.healingPerRound,
    'combat.player.shieldingAbsorbedPerRound': player.shieldingAbsorbedPerRound,
    'combat.player.manaSpentPerRound': player.manaSpentPerRound,
    'combat.player.crowdControlApplicationsPerRound': per(player.crowdControlApplications, rounds),
    'combat.player.crowdControlDurationPerRound': per(player.crowdControlDuration, rounds),
    'combat.player.actionsLostPerRound': per(player.actionsLost, rounds),
    'combat.player.actionsSuppressedPerRound': per(player.actionsSuppressed, rounds),
    'combat.enemy.hpDamagePerRound': enemy.hpDamagePerRound,
    'combat.enemy.shieldDamagePerRound': enemy.shieldDamagePerRound,
    'combat.enemy.healingPerRound': enemy.healingPerRound,
    'combat.enemy.shieldingAbsorbedPerRound': enemy.shieldingAbsorbedPerRound,
    'combat.enemy.manaSpentPerRound': enemy.manaSpentPerRound,
    'combat.enemy.crowdControlApplicationsPerRound': per(enemy.crowdControlApplications, rounds),
    'combat.enemy.crowdControlDurationPerRound': per(enemy.crowdControlDuration, rounds),
    'combat.enemy.actionsLostPerRound': per(enemy.actionsLost, rounds),
    'combat.enemy.actionsSuppressedPerRound': per(enemy.actionsSuppressed, rounds),
    'economy.goldEarned.p10': report.economy.goldEarned.p10,
    'economy.goldEarned.p50': report.economy.goldEarned.p50,
    'economy.goldEarned.p90': report.economy.goldEarned.p90,
    'economy.goldEarned.mean': report.economy.goldEarned.mean,
    'economy.goldSpent.p10': report.economy.goldSpent.p10,
    'economy.goldSpent.p50': report.economy.goldSpent.p50,
    'economy.goldSpent.p90': report.economy.goldSpent.p90,
    'economy.goldSpent.mean': report.economy.goldSpent.mean,
    'economy.finalGold.p10': report.economy.finalGold.p10,
    'economy.finalGold.p50': report.economy.finalGold.p50,
    'economy.finalGold.p90': report.economy.finalGold.p90,
    'economy.finalGold.mean': report.economy.finalGold.mean,
    'shops.visitsPerRun': per(report.shops.visits, runs),
    'shops.visitsWithAnyAffordableOfferRate': report.shops.visitsWithAnyAffordableOfferRate,
    'shops.allOffers.affordableRate': report.shops.allOffers.affordableRate,
    'shops.itemOffers.affordableRate': report.shops.itemOffers.affordableRate,
    'shops.recruitOffers.affordableRate': report.shops.recruitOffers.affordableRate,
    'purchases.commandsPerRun': per(report.purchases.commands, runs),
    'purchases.completionRate': per(report.purchases.completed, report.purchases.commands),
    'purchases.goldSpentPerRun': per(report.purchases.goldSpent, runs),
    'recruitments.commandsPerRun': per(report.recruitments.commands, runs),
    'recruitments.successRate': per(report.recruitments.successes, report.recruitments.commands),
    'recruitments.eventRecruitsPerRun': per(report.recruitments.eventRecruits, runs),
    'recruitments.goldSpentPerRun': per(report.recruitments.goldSpent, runs),
    'drops.totalPerRun': per(report.drops.total, runs),
    'drops.unknownItemsPerRun': per(report.drops.unknownItems, runs),
    'drops.blockedByCapacityPerRun': per(report.drops.blockedByCapacity, runs),
    'drops.rarity.commonPerRun': per(report.drops.byRarity[ItemRarity.Common], runs),
    'drops.rarity.uncommonPerRun': per(report.drops.byRarity[ItemRarity.Uncommon], runs),
    'drops.rarity.rarePerRun': per(report.drops.byRarity[ItemRarity.Rare], runs),
    'drops.rarity.epicPerRun': per(report.drops.byRarity[ItemRarity.Epic], runs),
    'drops.rarity.legendaryPerRun': per(report.drops.byRarity[ItemRarity.Legendary], runs),
    'drops.tier.1PerRun': per(report.drops.byTier[1], runs),
    'drops.tier.2PerRun': per(report.drops.byTier[2], runs),
    'drops.tier.3PerRun': per(report.drops.byTier[3], runs),
    'augments.choicesPerRun': per(report.augments.choices, runs),
    'augments.unknownChoicesPerRun': per(report.augments.unknownChoices, runs),
    'augments.tier.silverPerRun': per(report.augments.byTier[AugmentTier.Silver], runs),
    'augments.tier.goldPerRun': per(report.augments.byTier[AugmentTier.Gold], runs),
    'augments.tier.prismaticPerRun': per(report.augments.byTier[AugmentTier.Prismatic], runs),
  };
}

export function createAuthorityCohortBaselineReport(
  report: AuthorityCohortReport,
  schemaVersion: AuthorityCohortBaselineSchemaVersion = AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
): AuthorityCohortBaselineReport {
  const allMetrics = createMetrics(report);
  const metricNames =
    schemaVersion === LEGACY_AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION
      ? LEGACY_AUTHORITY_COHORT_BASELINE_METRIC_NAMES
      : AUTHORITY_COHORT_BASELINE_METRIC_NAMES;
  return {
    scenarioId: report.scenarioId,
    stratumFingerprint: report.stratum.fingerprint,
    sampleSize: report.sampleSize,
    metrics: Object.fromEntries(
      metricNames.map((name) => [name, allMetrics[name]]),
    ) as AuthorityCohortBaselineMetrics,
    deathLocations: report.deaths.byLocation.map((location) => ({ ...location })),
  };
}

function parseMetrics(
  value: unknown,
  path: string,
  schemaVersion: AuthorityCohortBaselineSchemaVersion,
): AuthorityCohortBaselineMetrics {
  const source = readObject(value, path);
  const metricNames =
    schemaVersion === LEGACY_AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION
      ? LEGACY_AUTHORITY_COHORT_BASELINE_METRIC_NAMES
      : AUTHORITY_COHORT_BASELINE_METRIC_NAMES;
  assertExactKeys(source, metricNames, path);
  const metrics = {} as Record<AuthorityCohortBaselineMetricName, number>;
  for (const name of metricNames) {
    const metric = readFiniteNumber(source[name], `${path}.${name}`);
    if (metric < 0) invalid(`${path}.${name}`, 'expected a non-negative metric.');
    if (BOUNDED_RATE_METRICS.has(name) && metric > 1) {
      invalid(`${path}.${name}`, 'expected a rate between 0 and 1.');
    }
    metrics[name] = metric;
  }
  for (const prefix of [
    'progression.waves',
    'progression.biomes',
    'progression.rounds',
    'economy.goldEarned',
    'economy.goldSpent',
    'economy.finalGold',
  ] as const) {
    if (
      metrics[`${prefix}.p10`] > metrics[`${prefix}.p50`] ||
      metrics[`${prefix}.p50`] > metrics[`${prefix}.p90`]
    ) {
      invalid(path, `${prefix} percentiles must be ordered p10 <= p50 <= p90.`);
    }
  }
  return metrics;
}

function parseDeathLocations(value: unknown, path: string): AuthorityCohortBaselineDeathLocation[] {
  if (!Array.isArray(value)) invalid(path, 'expected an array.');
  const locations: AuthorityCohortBaselineDeathLocation[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const locationPath = `${path}[${index}]`;
    const location = readObject(candidate, locationPath);
    assertExactKeys(location, ['biome', 'encounterId', 'count', 'share'], locationPath);
    const biome = readString(location.biome, `${locationPath}.biome`);
    if (!(BIOMES as readonly string[]).includes(biome)) {
      invalid(`${locationPath}.biome`, `unknown biome "${biome}".`);
    }
    const encounterId = readString(location.encounterId, `${locationPath}.encounterId`);
    const key = `${biome}\u0000${encounterId}`;
    if (seen.has(key)) invalid(locationPath, 'duplicates a death location.');
    seen.add(key);
    locations.push({
      biome: biome as Biome,
      encounterId,
      count: readSafeInteger(location.count, `${locationPath}.count`, 1),
      share: readRate(location.share, `${locationPath}.share`),
    });
  }
  return locations;
}

function parseBaselineReport(
  value: unknown,
  path: string,
  schemaVersion: AuthorityCohortBaselineSchemaVersion,
): AuthorityCohortBaselineReport {
  const report = readObject(value, path);
  assertExactKeys(
    report,
    ['scenarioId', 'stratumFingerprint', 'sampleSize', 'metrics', 'deathLocations'],
    path,
  );
  const stratumFingerprint = readString(report.stratumFingerprint, `${path}.stratumFingerprint`);
  if (!STRATUM_FINGERPRINT_PATTERN.test(stratumFingerprint)) {
    invalid(`${path}.stratumFingerprint`, 'expected a lowercase 32-character fingerprint.');
  }
  const parsed: AuthorityCohortBaselineReport = {
    scenarioId: readString(report.scenarioId, `${path}.scenarioId`),
    stratumFingerprint,
    sampleSize: readSafeInteger(report.sampleSize, `${path}.sampleSize`, 1),
    metrics: parseMetrics(report.metrics, `${path}.metrics`, schemaVersion),
    deathLocations: parseDeathLocations(report.deathLocations, `${path}.deathLocations`),
  };
  for (let index = 1; index < parsed.deathLocations.length; index++) {
    if (sortDeathLocations(parsed.deathLocations[index - 1]!, parsed.deathLocations[index]!) >= 0) {
      invalid(`${path}.deathLocations`, 'must be uniquely and canonically sorted.');
    }
  }
  const deaths = parsed.metrics['deaths.rate'] * parsed.sampleSize;
  const unattributed = parsed.metrics['deaths.unattributedRate'] * parsed.sampleSize;
  const located = parsed.deathLocations.reduce((total, location) => total + location.count, 0);
  const wins = parsed.metrics['outcome.winRate'] * parsed.sampleSize;
  if (
    Math.abs(wins - Math.round(wins)) > 1e-9 ||
    Math.abs(deaths - Math.round(deaths)) > 1e-9 ||
    Math.abs(unattributed - Math.round(unattributed)) > 1e-9 ||
    Math.round(deaths) !== located + Math.round(unattributed)
  ) {
    invalid(path, 'death rates, counts and locations are inconsistent.');
  }
  for (const location of parsed.deathLocations) {
    const expectedShare = deaths === 0 ? 0 : location.count / deaths;
    if (Math.abs(location.share - expectedShare) > 1e-9) {
      invalid(`${path}.deathLocations`, 'location share does not match the death count.');
    }
  }
  const knownDrops =
    parsed.metrics['drops.rarity.commonPerRun'] +
    parsed.metrics['drops.rarity.uncommonPerRun'] +
    parsed.metrics['drops.rarity.rarePerRun'] +
    parsed.metrics['drops.rarity.epicPerRun'] +
    parsed.metrics['drops.rarity.legendaryPerRun'];
  const tieredDrops =
    parsed.metrics['drops.tier.1PerRun'] +
    parsed.metrics['drops.tier.2PerRun'] +
    parsed.metrics['drops.tier.3PerRun'];
  if (
    Math.abs(
      parsed.metrics['drops.totalPerRun'] - parsed.metrics['drops.unknownItemsPerRun'] - knownDrops,
    ) > 1e-9 ||
    Math.abs(knownDrops - tieredDrops) > 1e-9
  ) {
    invalid(path, 'drop totals, rarities and tiers are inconsistent.');
  }
  const classifiedAugments =
    parsed.metrics['augments.tier.silverPerRun'] +
    parsed.metrics['augments.tier.goldPerRun'] +
    parsed.metrics['augments.tier.prismaticPerRun'];
  if (
    Math.abs(
      parsed.metrics['augments.choicesPerRun'] -
        parsed.metrics['augments.unknownChoicesPerRun'] -
        classifiedAugments,
    ) > 1e-9
  ) {
    invalid(path, 'augment choice and tier totals are inconsistent.');
  }
  return parsed;
}

function parseEntry(
  value: unknown,
  path: string,
  schemaVersion: AuthorityCohortBaselineSchemaVersion,
): AuthorityCohortBaselineEntry {
  const entry = readObject(value, path);
  assertExactKeys(entry, ['identity', 'source', 'reports'], path);
  const identity = parseIdentity(entry.identity, `${path}.identity`);
  const source = readObject(entry.source, `${path}.source`);
  assertExactKeys(source, ['kind', 'seeds', 'cellCount'], `${path}.source`);
  if (source.kind !== 'authority-cohort-matrix') {
    invalid(`${path}.source.kind`, 'expected "authority-cohort-matrix".');
  }
  if (!Array.isArray(source.seeds) || source.seeds.length === 0) {
    invalid(`${path}.source.seeds`, 'expected a non-empty array.');
  }
  const seeds = source.seeds.map((seed, index) =>
    readSafeInteger(seed, `${path}.source.seeds[${index}]`),
  );
  if (new Set(seeds).size !== seeds.length) invalid(`${path}.source.seeds`, 'contains duplicates.');
  const sortedSeeds = [...seeds].sort((left, right) => left - right);
  if (seeds.some((seed, index) => seed !== sortedSeeds[index])) {
    invalid(`${path}.source.seeds`, 'must be sorted in ascending order.');
  }
  const cellCount = readSafeInteger(source.cellCount, `${path}.source.cellCount`, 1);
  if (!Array.isArray(entry.reports) || entry.reports.length !== cellCount) {
    invalid(`${path}.reports`, `expected exactly ${cellCount} reports.`);
  }
  const reports = entry.reports.map((report, index) =>
    parseBaselineReport(report, `${path}.reports[${index}]`, schemaVersion),
  );
  const fingerprints = new Set<string>();
  const scenarioIds = new Set<string>();
  for (const report of reports) {
    if (report.sampleSize !== seeds.length) {
      invalid(`${path}.reports`, 'report sampleSize must match the source seed count.');
    }
    if (fingerprints.has(report.stratumFingerprint)) {
      invalid(`${path}.reports`, 'contains duplicate stratum fingerprints.');
    }
    if (scenarioIds.has(report.scenarioId)) {
      invalid(`${path}.reports`, 'contains duplicate scenario ids.');
    }
    fingerprints.add(report.stratumFingerprint);
    scenarioIds.add(report.scenarioId);
  }
  const sortedReports = [...reports].sort((left, right) =>
    left.scenarioId.localeCompare(right.scenarioId),
  );
  if (reports.some((report, index) => report !== sortedReports[index])) {
    invalid(`${path}.reports`, 'must be sorted by scenarioId.');
  }
  return {
    identity,
    source: { kind: 'authority-cohort-matrix', seeds, cellCount },
    reports,
  };
}

export function loadAuthorityCohortBaseline(
  value: unknown,
  expectedIdentity?: AuthorityCohortBaselineIdentity,
): AuthorityCohortBaselineDocument {
  const document = readObject(value, 'baseline');
  assertExactKeys(document, ['schemaVersion', 'entries'], 'baseline');
  if (
    document.schemaVersion !== LEGACY_AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION &&
    document.schemaVersion !== AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION
  ) {
    invalid(
      'baseline.schemaVersion',
      `expected ${LEGACY_AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION} or ${AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION}.`,
    );
  }
  const schemaVersion = document.schemaVersion;
  const rawEntries = readObject(document.entries, 'baseline.entries');
  if (Object.keys(rawEntries).length === 0) invalid('baseline.entries', 'must not be empty.');
  const entries: Record<string, AuthorityCohortBaselineEntry> = {};
  for (const [key, rawEntry] of Object.entries(rawEntries)) {
    const entry = parseEntry(rawEntry, `baseline.entries[${JSON.stringify(key)}]`, schemaVersion);
    const canonicalKey = createAuthorityCohortBaselineKey(entry.identity);
    if (key !== canonicalKey) {
      invalid(
        `baseline.entries[${JSON.stringify(key)}]`,
        `identity requires key "${canonicalKey}".`,
      );
    }
    entries[key] = entry;
  }
  if (expectedIdentity) {
    const expectedKey = createAuthorityCohortBaselineKey(expectedIdentity);
    if (!entries[expectedKey]) {
      throw new AuthorityCohortBaselineMismatchError(
        `No authority cohort baseline matches "${expectedKey}".`,
      );
    }
  }
  return { schemaVersion, entries };
}

function assertReportIdentity(
  report: AuthorityCohortReport,
  identity: AuthorityCohortBaselineIdentity,
): void {
  const actual: AuthorityCohortBaselineIdentity = {
    engineVersion: report.authority.engineVersion,
    contentHash: report.authority.contentHash,
    balanceModelVersion: identity.balanceModelVersion,
    policy: report.policy,
  };
  const expectedKey = createAuthorityCohortBaselineKey(identity);
  const actualKey = createAuthorityCohortBaselineKey(actual);
  if (
    actualKey !== expectedKey ||
    report.stratum.policy.id !== identity.policy.id ||
    report.stratum.policy.version !== identity.policy.version
  ) {
    throw new AuthorityCohortBaselineMismatchError(
      `Report "${report.scenarioId}" has identity "${actualKey}", expected "${expectedKey}".`,
    );
  }
}

export function createAuthorityCohortBaselineDocument(input: {
  readonly identity: AuthorityCohortBaselineIdentity;
  readonly seeds: readonly number[];
  readonly reports: readonly AuthorityCohortReport[];
  readonly schemaVersion?: AuthorityCohortBaselineSchemaVersion;
}): AuthorityCohortBaselineDocument {
  const schemaVersion = input.schemaVersion ?? AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION;
  for (const report of input.reports) assertReportIdentity(report, input.identity);
  const reports = input.reports
    .map((report) => createAuthorityCohortBaselineReport(report, schemaVersion))
    .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId));
  const seeds = [...input.seeds].sort((left, right) => left - right);
  const key = createAuthorityCohortBaselineKey(input.identity);
  return loadAuthorityCohortBaseline(
    {
      schemaVersion,
      entries: {
        [key]: {
          identity: input.identity,
          source: {
            kind: 'authority-cohort-matrix',
            seeds,
            cellCount: reports.length,
          },
          reports,
        },
      },
    },
    input.identity,
  );
}

function deathLocationKey(location: { biome: Biome; encounterId: string }): string {
  return `${location.biome}\u0000${location.encounterId}`;
}

function sortDeathLocations(
  left: { biome: Biome; encounterId: string },
  right: { biome: Biome; encounterId: string },
): number {
  return (
    BIOMES.indexOf(left.biome) - BIOMES.indexOf(right.biome) ||
    left.encounterId.localeCompare(right.encounterId)
  );
}

export function compareAuthorityCohortReports(
  baseline: AuthorityCohortBaselineReport,
  current: AuthorityCohortReport,
): AuthorityCohortReportComparison {
  if (
    baseline.scenarioId !== current.scenarioId ||
    baseline.stratumFingerprint !== current.stratum.fingerprint
  ) {
    throw new AuthorityCohortBaselineMismatchError(
      `Cannot compare baseline "${baseline.scenarioId}/${baseline.stratumFingerprint}" with report "${current.scenarioId}/${current.stratum.fingerprint}".`,
    );
  }
  const currentMetrics = createMetrics(current);
  const baselineLocations = new Map(
    baseline.deathLocations.map((location) => [deathLocationKey(location), location]),
  );
  const currentLocations = new Map(
    current.deaths.byLocation.map((location) => [deathLocationKey(location), location]),
  );
  const locations = new Set([...baselineLocations.keys(), ...currentLocations.keys()]);
  return {
    scenarioId: current.scenarioId,
    stratumFingerprint: current.stratum.fingerprint,
    baselineSampleSize: baseline.sampleSize,
    currentSampleSize: current.sampleSize,
    metrics: (Object.keys(baseline.metrics) as AuthorityCohortBaselineMetricName[]).map(
      (metric) => {
        const baselineValue = baseline.metrics[metric]!;
        const currentValue = currentMetrics[metric]!;
        const absoluteDelta = currentValue - baselineValue;
        return {
          metric,
          baseline: baselineValue,
          current: currentValue,
          absoluteDelta,
          relativeDelta: baselineValue === 0 ? null : absoluteDelta / Math.abs(baselineValue),
        };
      },
    ),
    deathLocations: [...locations]
      .map((key) => {
        const baselineLocation = baselineLocations.get(key);
        const currentLocation = currentLocations.get(key);
        const location = baselineLocation ?? currentLocation;
        if (!location) throw new Error('Unreachable empty death location.');
        const baselineShare = baselineLocation?.share ?? 0;
        const currentShare = currentLocation?.share ?? 0;
        return {
          biome: location.biome,
          encounterId: location.encounterId,
          baselineShare,
          currentShare,
          shareDelta: currentShare - baselineShare,
        };
      })
      .sort(sortDeathLocations),
  };
}

export function compareAuthorityCohortBaseline(
  entry: AuthorityCohortBaselineEntry,
  currentReports: readonly AuthorityCohortReport[],
): AuthorityCohortBaselineComparison {
  for (const report of currentReports) assertReportIdentity(report, entry.identity);
  const currentByFingerprint = new Map(
    currentReports.map((report) => [report.stratum.fingerprint, report]),
  );
  if (currentByFingerprint.size !== currentReports.length) {
    throw new AuthorityCohortBaselineMismatchError('Current reports contain duplicate strata.');
  }
  const baselineFingerprints = new Set(entry.reports.map((report) => report.stratumFingerprint));
  const missing = entry.reports.filter(
    (report) => !currentByFingerprint.has(report.stratumFingerprint),
  );
  const unexpected = currentReports.filter(
    (report) => !baselineFingerprints.has(report.stratum.fingerprint),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new AuthorityCohortBaselineMismatchError(
      `Baseline/report strata mismatch (missing=${missing.length}, unexpected=${unexpected.length}).`,
    );
  }
  return {
    baselineKey: createAuthorityCohortBaselineKey(entry.identity),
    reports: entry.reports.map((baselineReport) =>
      compareAuthorityCohortReports(
        baselineReport,
        currentByFingerprint.get(baselineReport.stratumFingerprint)!,
      ),
    ),
  };
}

const EXTREME_METRICS = [
  {
    name: 'progression.waves',
    value: (run: AuthorityCohortRun) => run.result.snapshot.totalWavesCompleted,
  },
  {
    name: 'progression.biomes',
    value: (run: AuthorityCohortRun) => run.result.snapshot.biomesVisited.length,
  },
  {
    name: 'progression.rounds',
    value: (run: AuthorityCohortRun) =>
      run.result.combatSummaries.reduce((total, combat) => total + combat.rounds, 0),
  },
  {
    name: 'economy.goldEarned',
    value: (run: AuthorityCohortRun) => run.result.snapshot.ledger.gold.earned,
  },
  {
    name: 'economy.goldSpent',
    value: (run: AuthorityCohortRun) => run.result.snapshot.ledger.gold.spent,
  },
  {
    name: 'economy.finalGold',
    value: (run: AuthorityCohortRun) => run.result.snapshot.gold,
  },
] as const;

function rankedRun(
  runs: readonly AuthorityCohortRun[],
  value: (run: AuthorityCohortRun) => number,
  percentile: 0.1 | 0.9,
): AuthorityCohortRun {
  const target =
    percentile === 0.1
      ? calculateAuthorityCohortPercentiles(runs.map(value)).p10
      : calculateAuthorityCohortPercentiles(runs.map(value)).p90;
  return [...runs].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    return (
      Math.abs(leftValue - target) - Math.abs(rightValue - target) ||
      (percentile === 0.1 ? leftValue - rightValue : rightValue - leftValue) ||
      left.seed - right.seed
    );
  })[0]!;
}

function terminalDefeatLocation(
  run: AuthorityCohortRun,
): { biome: Biome; encounterId: string } | null {
  if (run.result.snapshot.endReason !== 'defeat') return null;
  const combat = [...run.result.combatSummaries]
    .reverse()
    .find((summary) => summary.winner === 'enemy');
  return combat ? { biome: combat.biome, encounterId: combat.encounterId } : null;
}

export function createAuthorityCohortTraceArtifacts(input: {
  readonly identity: AuthorityCohortBaselineIdentity;
  readonly cohorts: readonly AuthorityCohortResult[];
}): AuthorityCohortTraceArtifactBundle {
  const artifacts = new Map<
    string,
    { cohort: AuthorityCohortResult; run: AuthorityCohortRun; reasons: Set<string> }
  >();
  const include = (cohort: AuthorityCohortResult, run: AuthorityCohortRun, reason: string) => {
    const key = `${cohort.stratum.fingerprint}\u0000${run.seed}`;
    const existing = artifacts.get(key);
    if (existing) existing.reasons.add(reason);
    else artifacts.set(key, { cohort, run, reasons: new Set([reason]) });
  };

  for (const cohort of input.cohorts) {
    const identityKey = createAuthorityCohortBaselineKey({
      engineVersion: cohort.authority.engineVersion,
      contentHash: cohort.authority.contentHash,
      balanceModelVersion: input.identity.balanceModelVersion,
      policy: cohort.policy,
    });
    const expectedKey = createAuthorityCohortBaselineKey(input.identity);
    if (identityKey !== expectedKey) {
      throw new AuthorityCohortBaselineMismatchError(
        `Cohort "${cohort.scenarioId}" has identity "${identityKey}", expected "${expectedKey}".`,
      );
    }
    if (cohort.runs.length === 0) continue;
    for (const metric of EXTREME_METRICS) {
      include(cohort, rankedRun(cohort.runs, metric.value, 0.1), `${metric.name}:p10`);
      include(cohort, rankedRun(cohort.runs, metric.value, 0.9), `${metric.name}:p90`);
    }

    const defeats = new Map<
      string,
      { location: { biome: Biome; encounterId: string } | null; runs: AuthorityCohortRun[] }
    >();
    for (const run of cohort.runs) {
      if (run.result.snapshot.endReason !== 'defeat') continue;
      const location = terminalDefeatLocation(run);
      const key = location ? deathLocationKey(location) : 'unattributed';
      const group = defeats.get(key) ?? { location, runs: [] };
      group.runs.push(run);
      defeats.set(key, group);
    }
    const totalDefeats = [...defeats.values()].reduce(
      (total, group) => total + group.runs.length,
      0,
    );
    for (const group of [...defeats.values()]
      .filter((candidate) => candidate.runs.length / totalDefeats >= 0.35)
      .sort((left, right) => {
        if (left.location === null) return right.location === null ? 0 : 1;
        if (right.location === null) return -1;
        return sortDeathLocations(left.location, right.location);
      })) {
      const representative = [...group.runs].sort((left, right) => left.seed - right.seed)[0]!;
      const location = group.location
        ? `${group.location.biome}/${group.location.encounterId}`
        : 'unattributed';
      include(cohort, representative, `defeat-concentration:${location}`);
    }
  }

  return {
    schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
    baselineKey: createAuthorityCohortBaselineKey(input.identity),
    traces: [...artifacts.values()]
      .sort(
        (left, right) =>
          left.cohort.stratum.fingerprint.localeCompare(right.cohort.stratum.fingerprint) ||
          left.run.seed - right.run.seed,
      )
      .map(({ cohort, run, reasons }) => ({
        scenarioId: cohort.scenarioId,
        stratumFingerprint: cohort.stratum.fingerprint,
        seed: run.seed,
        reasons: [...reasons].sort(),
        attempt: structuredClone(run.attempt),
        trace: structuredClone(run.trace),
      })),
  };
}
