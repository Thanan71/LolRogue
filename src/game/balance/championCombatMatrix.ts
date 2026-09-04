export const CHAMPION_COMBAT_MATRIX_SCHEMA_VERSION = 2 as const;
export const CHAMPION_COMBAT_MATRIX_LEVEL = 1 as const;
export const CHAMPION_COMBAT_MATRIX_MAX_ROUNDS = 50 as const;
export const CHAMPION_COMBAT_MATRIX_SEEDS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => index),
);
export const CHAMPION_COMBAT_MATRIX_CHAMPION_IDS = Object.freeze([
  'Garen',
  'Annie',
  'Ashe',
  'Darius',
  'Lux',
  'Soraka',
  'Jinx',
  'Leona',
  'Malphite',
  'Warwick',
]);

export type ChampionCombatSide = 'player' | 'enemy';
export type ChampionCombatWinner = ChampionCombatSide | 'draw';

export interface ChampionCombatMatrixPartition {
  readonly id: string;
  readonly teamA: readonly string[];
  readonly teamB: readonly string[];
}

export interface ChampionCombatMatrixEvent {
  readonly type: string;
  readonly source?: string;
  readonly target?: string;
  readonly champion?: string;
  readonly combatantId?: string;
  readonly sourceCombatantId?: string;
  readonly targetCombatantId?: string;
  readonly sourceSide?: ChampionCombatSide;
  readonly targetSide?: ChampionCombatSide;
  readonly side?: ChampionCombatSide;
  readonly amount?: number;
  readonly hpDamage?: number;
  readonly manaSpent?: number;
  readonly ccType?: string;
  readonly shieldAbsorbedBySource?: Readonly<Record<string, number>>;
}

export interface ChampionCombatMatrixBattleResult {
  readonly winner: ChampionCombatWinner;
  readonly rounds: number;
  readonly events: readonly ChampionCombatMatrixEvent[];
}

export interface ChampionCombatMatrixRuntime {
  readonly engineVersion: string;
  readonly contentHash: string;
  simulateBattle(input: {
    readonly playerChampionIds: readonly string[];
    readonly enemyChampionIds: readonly string[];
    readonly level: number;
    readonly randomSeed: number;
    readonly maxRounds: number;
  }): ChampionCombatMatrixBattleResult;
}

export interface ChampionCombatMatrixChampionReport {
  readonly championId: string;
  readonly appearances: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  /** Draws never make this rate or its acceptance gate look healthier. */
  readonly decisiveWinRate: number | null;
  readonly hpDamagePerRound: number | null;
  readonly effectiveHealingPerRound: number | null;
  readonly shieldAbsorbedPerRound: number | null;
  readonly manaSpentPerRound: number | null;
  readonly enemyActionsRemovedByCcPerCombat: number | null;
}

export interface ChampionCombatMatrixMetricAvailability {
  readonly hpDamage: boolean;
  readonly effectiveHealing: boolean;
  readonly shieldAbsorbed: boolean;
  readonly manaSpent: boolean;
  readonly enemyActionsRemovedByCc: boolean;
}

export interface ChampionCombatMatrixReport {
  readonly authority: {
    readonly engineVersion: string;
    readonly contentHash: string;
  };
  readonly level: number;
  readonly championIds: readonly string[];
  readonly pairedSeeds: readonly number[];
  readonly partitionCount: number;
  readonly orientationsPerPartition: 2;
  readonly combatCount: number;
  readonly resultFingerprint: string;
  readonly metricAvailability: ChampionCombatMatrixMetricAvailability;
  readonly champions: readonly ChampionCombatMatrixChampionReport[];
}

export interface ChampionCombatMatrixChampionDelta {
  readonly championId: string;
  readonly decisiveWinRatePercentagePoints: number | null;
  readonly hpDamagePerRound: number | null;
  readonly effectiveHealingPerRound: number | null;
  readonly shieldAbsorbedPerRound: number | null;
  readonly manaSpentPerRound: number | null;
  readonly enemyActionsRemovedByCcPerCombat: number | null;
}

export interface ChampionCombatMatrixComparison {
  readonly schemaVersion: typeof CHAMPION_COMBAT_MATRIX_SCHEMA_VERSION;
  readonly methodology: {
    readonly level: typeof CHAMPION_COMBAT_MATRIX_LEVEL;
    readonly partitionCount: number;
    readonly orientationsPerPartition: 2;
    readonly pairedSeeds: readonly number[];
    readonly combatsPerRuntime: number;
  };
  readonly baseline: ChampionCombatMatrixReport;
  readonly candidate: ChampionCombatMatrixReport;
  readonly candidateSourceParity: {
    readonly exact: boolean;
    readonly sourceResultFingerprint: string;
    readonly bundleResultFingerprint: string;
  };
  readonly championDeltas: readonly ChampionCombatMatrixChampionDelta[];
  readonly p1Acceptance: {
    readonly rule: 'every champion has at least one decisive win and one decisive loss';
    readonly passed: boolean;
    readonly violations: readonly string[];
  };
  readonly p0Acceptance: {
    readonly rule: 'every champion stays inside the 45-55% decisive-win band with a roster gap at most 10 points';
    readonly targetDecisiveWinRate: readonly [0.45, 0.55];
    readonly maximumRosterGap: 0.1;
    readonly measuredRosterGap: number | null;
    readonly minimum: { readonly championId: string; readonly decisiveWinRate: number } | null;
    readonly maximum: { readonly championId: string; readonly decisiveWinRate: number } | null;
    readonly passed: boolean;
    readonly violations: readonly string[];
  };
}

interface MutableChampionMetrics {
  appearances: number;
  wins: number;
  losses: number;
  draws: number;
  rounds: number;
  hpDamage: number;
  effectiveHealing: number;
  shieldAbsorbed: number;
  manaSpent: number;
  enemyActionsRemovedByCc: number;
}

interface MutableMetricAvailability {
  hpDamage: boolean;
  effectiveHealing: boolean;
  shieldAbsorbed: boolean;
  manaSpent: boolean;
  enemyActionsRemovedByCc: boolean;
}

const HARD_CROWD_CONTROL_TYPES = new Set(['charm', 'fear', 'knockup', 'stun']);

function hash32(value: string, initial = 0x811c9dc5): number {
  let hash = initial >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function round(value: number, digits = 6): number {
  const precision = 10 ** digits;
  return Math.round((value + Number.EPSILON) * precision) / precision;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function assertChampionIds(championIds: readonly string[]): void {
  if (championIds.length !== 10 || new Set(championIds).size !== 10) {
    throw new RangeError('The champion combat matrix requires exactly ten unique champions.');
  }
  if (championIds.some((championId) => !championId)) {
    throw new TypeError('Champion ids must not be empty.');
  }
}

/**
 * Returns each unordered 5v5 split once. Requiring the first champion in team A
 * removes complementary duplicates: C(9, 4) = 126 partitions.
 */
export function createChampionCombatMatrixPartitions(
  championIds: readonly string[] = CHAMPION_COMBAT_MATRIX_CHAMPION_IDS,
): readonly ChampionCombatMatrixPartition[] {
  assertChampionIds(championIds);
  const anchor = championIds[0];
  if (!anchor) throw new RangeError('The champion matrix anchor is unavailable.');
  const partitions: ChampionCombatMatrixPartition[] = [];

  function choose(start: number, selected: string[]): void {
    if (selected.length === 4) {
      const teamA = [anchor, ...selected];
      const teamAIds = new Set(teamA);
      const teamB = championIds.filter((championId) => !teamAIds.has(championId));
      partitions.push({
        id: `${teamA.join('-').toLowerCase()}--${teamB.join('-').toLowerCase()}`,
        teamA,
        teamB,
      });
      return;
    }
    for (let index = start; index < championIds.length; index++) {
      const championId = championIds[index];
      if (championId) choose(index + 1, [...selected, championId]);
    }
  }

  choose(1, []);
  return partitions;
}

/** A tiny seeded PRNG shared by source and instrumented authority bundles. */
export function createChampionCombatMatrixRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function battleRandomSeed(partitionId: string, pairedSeed: number): number {
  return hash32(partitionId, (pairedSeed ^ 0x9e3779b9) >>> 0);
}

function emptyMetrics(): MutableChampionMetrics {
  return {
    appearances: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rounds: 0,
    hpDamage: 0,
    effectiveHealing: 0,
    shieldAbsorbed: 0,
    manaSpent: 0,
    enemyActionsRemovedByCc: 0,
  };
}

function addMetric(
  metrics: ReadonlyMap<string, MutableChampionMetrics>,
  championId: string | undefined,
  field: keyof Pick<
    MutableChampionMetrics,
    'hpDamage' | 'effectiveHealing' | 'shieldAbsorbed' | 'manaSpent' | 'enemyActionsRemovedByCc'
  >,
  value: number | undefined,
): void {
  const champion = championId ? metrics.get(championId) : undefined;
  if (!champion || !Number.isFinite(value) || !value) return;
  champion[field] += value;
}

function captureBattleMetrics(
  metrics: ReadonlyMap<string, MutableChampionMetrics>,
  availability: MutableMetricAvailability,
  result: ChampionCombatMatrixBattleResult,
): void {
  const pendingHardCcSource = new Map<string, string>();
  for (const event of result.events) {
    if (event.type === 'damage') {
      availability.hpDamage ||= event.hpDamage !== undefined;
      availability.shieldAbsorbed ||= event.shieldAbsorbedBySource !== undefined;
      addMetric(metrics, event.source, 'hpDamage', event.hpDamage ?? event.amount);
      for (const [source, amount] of Object.entries(event.shieldAbsorbedBySource ?? {})) {
        addMetric(metrics, source, 'shieldAbsorbed', amount);
      }
    } else if (event.type === 'heal') {
      availability.effectiveHealing ||= event.amount !== undefined;
      addMetric(metrics, event.source, 'effectiveHealing', event.amount);
    } else if (event.type === 'action_select') {
      availability.manaSpent ||= event.manaSpent !== undefined;
      addMetric(metrics, event.champion, 'manaSpent', event.manaSpent);
      if (event.champion) pendingHardCcSource.delete(event.champion);
    } else if (
      event.type === 'crowd_control_applied' &&
      event.ccType &&
      HARD_CROWD_CONTROL_TYPES.has(event.ccType) &&
      event.source
    ) {
      const target = event.targetCombatantId ?? event.target;
      if (target) {
        availability.enemyActionsRemovedByCc = true;
        pendingHardCcSource.set(target, event.source);
      }
    } else if (event.type === 'turn_skipped') {
      const target = event.combatantId ?? event.champion;
      const source = target ? pendingHardCcSource.get(target) : undefined;
      addMetric(metrics, source, 'enemyActionsRemovedByCc', 1);
      if (target) pendingHardCcSource.delete(target);
    }
  }
}

function championBattleSummary(
  metrics: ReadonlyMap<string, MutableChampionMetrics>,
  championIds: readonly string[],
  availability: ChampionCombatMatrixMetricAvailability,
): readonly ChampionCombatMatrixChampionReport[] {
  return championIds.map((championId) => {
    const value = metrics.get(championId);
    if (!value) throw new Error(`Missing matrix metrics for champion "${championId}".`);
    const decisiveBattles = value.wins + value.losses;
    return {
      championId,
      appearances: value.appearances,
      wins: value.wins,
      losses: value.losses,
      draws: value.draws,
      decisiveWinRate: decisiveBattles === 0 ? null : round(value.wins / decisiveBattles),
      hpDamagePerRound: availability.hpDamage ? ratio(value.hpDamage, value.rounds) : null,
      effectiveHealingPerRound: availability.effectiveHealing
        ? ratio(value.effectiveHealing, value.rounds)
        : null,
      shieldAbsorbedPerRound: availability.shieldAbsorbed
        ? ratio(value.shieldAbsorbed, value.rounds)
        : null,
      manaSpentPerRound: availability.manaSpent ? ratio(value.manaSpent, value.rounds) : null,
      enemyActionsRemovedByCcPerCombat: availability.enemyActionsRemovedByCc
        ? ratio(value.enemyActionsRemovedByCc, value.appearances)
        : null,
    };
  });
}

export function runChampionCombatMatrix(
  runtime: ChampionCombatMatrixRuntime,
  options: {
    readonly championIds?: readonly string[];
    readonly partitions?: readonly ChampionCombatMatrixPartition[];
    readonly pairedSeeds?: readonly number[];
  } = {},
): ChampionCombatMatrixReport {
  const championIds = options.championIds ?? CHAMPION_COMBAT_MATRIX_CHAMPION_IDS;
  assertChampionIds(championIds);
  const partitions = options.partitions ?? createChampionCombatMatrixPartitions(championIds);
  const pairedSeeds = options.pairedSeeds ?? CHAMPION_COMBAT_MATRIX_SEEDS;
  if (partitions.length === 0 || pairedSeeds.length === 0) {
    throw new RangeError('The champion combat matrix requires partitions and paired seeds.');
  }
  const metrics = new Map(championIds.map((championId) => [championId, emptyMetrics()]));
  const metricAvailability: MutableMetricAvailability = {
    hpDamage: false,
    effectiveHealing: false,
    shieldAbsorbed: false,
    manaSpent: false,
    enemyActionsRemovedByCc: false,
  };
  let combatCount = 0;
  let resultHash = 0x811c9dc5;

  for (const partition of partitions) {
    const orientations = [
      { player: partition.teamA, enemy: partition.teamB },
      { player: partition.teamB, enemy: partition.teamA },
    ] as const;
    for (const pairedSeed of pairedSeeds) {
      const randomSeed = battleRandomSeed(partition.id, pairedSeed);
      for (const orientation of orientations) {
        const result = runtime.simulateBattle({
          playerChampionIds: orientation.player,
          enemyChampionIds: orientation.enemy,
          level: CHAMPION_COMBAT_MATRIX_LEVEL,
          randomSeed,
          maxRounds: CHAMPION_COMBAT_MATRIX_MAX_ROUNDS,
        });
        combatCount++;
        for (const championId of championIds) {
          const champion = metrics.get(championId);
          if (!champion) continue;
          const side = orientation.player.includes(championId) ? 'player' : 'enemy';
          champion.appearances++;
          champion.rounds += result.rounds;
          if (result.winner === 'draw') champion.draws++;
          else if (result.winner === side) champion.wins++;
          else champion.losses++;
        }
        captureBattleMetrics(metrics, metricAvailability, result);
        resultHash = hash32(
          stableSerialize({
            partition: partition.id,
            pairedSeed,
            player: orientation.player,
            winner: result.winner,
            rounds: result.rounds,
            events: result.events,
          }),
          resultHash,
        );
      }
    }
  }

  return {
    authority: {
      engineVersion: runtime.engineVersion,
      contentHash: runtime.contentHash,
    },
    level: CHAMPION_COMBAT_MATRIX_LEVEL,
    championIds: [...championIds],
    pairedSeeds: [...pairedSeeds],
    partitionCount: partitions.length,
    orientationsPerPartition: 2,
    combatCount,
    resultFingerprint: resultHash.toString(16).padStart(8, '0'),
    metricAvailability,
    champions: championBattleSummary(metrics, championIds, metricAvailability),
  };
}

function delta(candidate: number | null, baseline: number | null): number | null {
  return candidate === null || baseline === null ? null : round(candidate - baseline);
}

function assertComparableReports(
  baseline: ChampionCombatMatrixReport,
  candidate: ChampionCombatMatrixReport,
): void {
  const geometry = (report: ChampionCombatMatrixReport) =>
    stableSerialize({
      level: report.level,
      championIds: report.championIds,
      pairedSeeds: report.pairedSeeds,
      partitionCount: report.partitionCount,
      orientationsPerPartition: report.orientationsPerPartition,
      combatCount: report.combatCount,
    });
  if (geometry(baseline) !== geometry(candidate)) {
    throw new RangeError('Champion combat reports use different matrix geometry.');
  }
}

export function evaluateChampionCombatP0Acceptance(
  report: ChampionCombatMatrixReport,
): ChampionCombatMatrixComparison['p0Acceptance'] {
  const targetDecisiveWinRate = [0.45, 0.55] as const;
  const maximumRosterGap = 0.1 as const;
  const rates: Array<{ championId: string; decisiveWinRate: number }> = [];
  const violations: string[] = [];

  for (const champion of report.champions) {
    const decisiveCombats = champion.wins + champion.losses;
    if (champion.appearances !== decisiveCombats + champion.draws) {
      violations.push(`${champion.championId}: incoherent appearance totals`);
    }
    if (champion.draws > 0) {
      violations.push(`${champion.championId}: ${champion.draws} draw(s)`);
    }
    if (champion.wins === 0 || champion.losses === 0 || decisiveCombats === 0) {
      violations.push(`${champion.championId}: requires both decisive wins and losses`);
      continue;
    }
    const decisiveWinRate = champion.wins / decisiveCombats;
    rates.push({ championId: champion.championId, decisiveWinRate });
    if (decisiveWinRate < targetDecisiveWinRate[0] || decisiveWinRate > targetDecisiveWinRate[1]) {
      violations.push(
        `${champion.championId}: decisive win rate ${round(decisiveWinRate)} is outside 0.45-0.55`,
      );
    }
  }

  const orderedRates = [...rates].sort(
    (left, right) =>
      left.decisiveWinRate - right.decisiveWinRate ||
      left.championId.localeCompare(right.championId),
  );
  const minimumRate = orderedRates[0] ?? null;
  const maximumRate = orderedRates[orderedRates.length - 1] ?? null;
  const measuredRosterGap =
    minimumRate && maximumRate ? maximumRate.decisiveWinRate - minimumRate.decisiveWinRate : null;
  if (measuredRosterGap === null || measuredRosterGap > maximumRosterGap) {
    violations.push(
      measuredRosterGap === null
        ? 'roster: no decisive champion rates'
        : `roster: decisive win-rate gap ${round(measuredRosterGap)} exceeds 0.1`,
    );
  }

  return {
    rule: 'every champion stays inside the 45-55% decisive-win band with a roster gap at most 10 points',
    targetDecisiveWinRate,
    maximumRosterGap,
    measuredRosterGap: measuredRosterGap === null ? null : round(measuredRosterGap),
    minimum: minimumRate
      ? { ...minimumRate, decisiveWinRate: round(minimumRate.decisiveWinRate) }
      : null,
    maximum: maximumRate
      ? { ...maximumRate, decisiveWinRate: round(maximumRate.decisiveWinRate) }
      : null,
    passed: violations.length === 0,
    violations,
  };
}

export function createChampionCombatMatrixComparison(input: {
  readonly baseline: ChampionCombatMatrixReport;
  readonly candidateBundle: ChampionCombatMatrixReport;
  readonly candidateSource: ChampionCombatMatrixReport;
}): ChampionCombatMatrixComparison {
  assertComparableReports(input.baseline, input.candidateBundle);
  assertComparableReports(input.candidateBundle, input.candidateSource);
  const bundleComparable = { ...input.candidateBundle, authority: undefined };
  const sourceComparable = { ...input.candidateSource, authority: undefined };
  const sourceParityExact = stableSerialize(bundleComparable) === stableSerialize(sourceComparable);
  if (!sourceParityExact) {
    throw new Error('The current source and authority bundle champion matrices diverged.');
  }

  const baselineByChampion = new Map(
    input.baseline.champions.map((champion) => [champion.championId, champion]),
  );
  const championDeltas = input.candidateBundle.champions.map((candidate) => {
    const baseline = baselineByChampion.get(candidate.championId);
    if (!baseline) throw new Error(`Missing baseline for champion "${candidate.championId}".`);
    return {
      championId: candidate.championId,
      decisiveWinRatePercentagePoints:
        candidate.decisiveWinRate === null || baseline.decisiveWinRate === null
          ? null
          : round((candidate.decisiveWinRate - baseline.decisiveWinRate) * 100),
      hpDamagePerRound: delta(candidate.hpDamagePerRound, baseline.hpDamagePerRound),
      effectiveHealingPerRound: delta(
        candidate.effectiveHealingPerRound,
        baseline.effectiveHealingPerRound,
      ),
      shieldAbsorbedPerRound: delta(
        candidate.shieldAbsorbedPerRound,
        baseline.shieldAbsorbedPerRound,
      ),
      manaSpentPerRound: delta(candidate.manaSpentPerRound, baseline.manaSpentPerRound),
      enemyActionsRemovedByCcPerCombat: delta(
        candidate.enemyActionsRemovedByCcPerCombat,
        baseline.enemyActionsRemovedByCcPerCombat,
      ),
    };
  });
  const violations = input.candidateBundle.champions
    .filter((champion) => champion.wins === 0 || champion.losses === 0)
    .map((champion) => champion.championId);

  return {
    schemaVersion: CHAMPION_COMBAT_MATRIX_SCHEMA_VERSION,
    methodology: {
      level: CHAMPION_COMBAT_MATRIX_LEVEL,
      partitionCount: input.candidateBundle.partitionCount,
      orientationsPerPartition: 2,
      pairedSeeds: [...input.candidateBundle.pairedSeeds],
      combatsPerRuntime: input.candidateBundle.combatCount,
    },
    baseline: input.baseline,
    candidate: input.candidateBundle,
    candidateSourceParity: {
      exact: true,
      sourceResultFingerprint: input.candidateSource.resultFingerprint,
      bundleResultFingerprint: input.candidateBundle.resultFingerprint,
    },
    championDeltas,
    p1Acceptance: {
      rule: 'every champion has at least one decisive win and one decisive loss',
      passed: violations.length === 0,
      violations,
    },
    p0Acceptance: evaluateChampionCombatP0Acceptance(input.candidateBundle),
  };
}
