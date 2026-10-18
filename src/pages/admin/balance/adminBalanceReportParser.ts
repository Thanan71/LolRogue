import {
  analyticsArray,
  analyticsCount,
  analyticsDateMs,
  analyticsEnum,
  analyticsRecord,
  analyticsText,
  analyticsTimestamp,
  analyticsTimestampUs,
} from '../analytics/adminAnalyticsValidation';
import type { AnalyticsSegment } from '../analytics/analyticsTypes';
import {
  balanceEngine,
  balanceFilterIdentity,
  balanceFinite,
  balanceHash,
  balanceId,
  balanceIds,
  balanceLiteral,
  balanceVersion,
  invalidBalance,
  validateAdminBalanceFilters,
} from './adminBalanceValidation';
import type {
  BalanceBuildReport,
  BalanceBuildRow,
  BalanceChampionReport,
  BalanceChampionRow,
  BalanceContext,
  BalanceFilters,
  BalanceReportBase,
  BalanceSelections,
} from './balanceTypes';

const BASE_KEYS = [
  'snapshotAt',
  'filters',
  'minimumSampleSize',
  'segments',
  'contexts',
  'population',
];
const SEGMENT_KEYS = [
  'id',
  'engineVersion',
  'gameplayVersion',
  'progressionVersion',
  'commandVersion',
  'contentHash',
  'mode',
  'difficulty',
];
const CONTEXT_KEYS = [
  'id',
  'segmentId',
  'initialComposition',
  'runeIds',
  'masteryHash',
  'enhancementHash',
];
const COUNTS_KEYS = ['contextId', 'cohortRuns', 'cohortPlayers', 'runs', 'players', 'wins'];

function parseSegment(value: unknown, filters: BalanceFilters): AnalyticsSegment {
  const row = analyticsRecord(value, SEGMENT_KEYS);
  const result: AnalyticsSegment = {
    id: analyticsText(row.id, 128),
    engineVersion: balanceEngine(row.engineVersion),
    gameplayVersion: balanceVersion(row.gameplayVersion),
    progressionVersion: balanceVersion(row.progressionVersion),
    commandVersion: balanceVersion(row.commandVersion),
    contentHash: balanceHash(row.contentHash),
    mode: analyticsEnum(row.mode, ['normal', 'daily']),
    difficulty: analyticsEnum(row.difficulty, ['easy', 'normal', 'hard']),
  };
  for (const key of SEGMENT_KEYS.slice(1) as (keyof AnalyticsSegment)[]) {
    const expected = filters[key as keyof BalanceFilters];
    if (expected !== undefined && expected !== 'all' && result[key] !== expected)
      return invalidBalance();
  }
  return result;
}

function parseSelections(value: unknown, filters: BalanceFilters): BalanceSelections {
  const row = analyticsRecord(value, ['population', 'segments', 'rows']);
  const rawPopulation = analyticsRecord(row.population, ['starts', 'uniquePlayers']);
  const population = {
    starts: analyticsCount(rawPopulation.starts),
    uniquePlayers: analyticsCount(rawPopulation.uniquePlayers),
  };
  const segments = analyticsArray(row.segments, 32).map((value) => parseSegment(value, filters));
  uniqueBy(segments, (segment) => segment.id);
  uniqueBy(segments, ({ id: _id, ...identity }) => JSON.stringify(identity));
  const segmentIds = new Set(segments.map((segment) => segment.id));
  if (
    population.uniquePlayers > population.starts ||
    (population.starts === 0) !== (population.uniquePlayers === 0) ||
    (population.starts === 0) !== (segments.length === 0)
  )
    return invalidBalance();
  const rows = analyticsArray(row.rows, 1024).map((value) => {
    const item = analyticsRecord(value, [
      'segmentId',
      'championId',
      'catalogStatus',
      'cohortStarts',
      'cohortPlayers',
      'starts',
      'players',
    ]);
    const result = {
      segmentId: analyticsText(item.segmentId, 128),
      championId: balanceId(item.championId),
      catalogStatus: analyticsEnum(item.catalogStatus, ['known', 'unknown']),
      cohortStarts: analyticsCount(item.cohortStarts),
      cohortPlayers: analyticsCount(item.cohortPlayers),
      starts: analyticsCount(item.starts),
      players: analyticsCount(item.players),
    };
    if (
      !segmentIds.has(result.segmentId) ||
      result.cohortStarts < 1 ||
      result.cohortPlayers < 1 ||
      result.cohortStarts > population.starts ||
      result.cohortPlayers > population.uniquePlayers ||
      result.cohortPlayers > result.cohortStarts ||
      result.starts > result.cohortStarts ||
      result.players > result.cohortPlayers ||
      result.players > result.starts ||
      (result.starts === 0) !== (result.players === 0) ||
      (filters.championId !== undefined && result.championId !== filters.championId)
    )
      return invalidBalance();
    return result;
  });
  uniqueBy(rows, (item) => JSON.stringify([item.segmentId, item.championId]));
  const denominators = new Map<string, { starts: number; players: number }>();
  for (const item of rows) {
    const previous = denominators.get(item.segmentId);
    if (
      previous &&
      (previous.starts !== item.cohortStarts || previous.players !== item.cohortPlayers)
    )
      return invalidBalance();
    denominators.set(item.segmentId, { starts: item.cohortStarts, players: item.cohortPlayers });
  }
  const starts = [...denominators.values()].reduce((sum, item) => sum + item.starts, 0);
  if (
    starts > population.starts ||
    (!filters.championId && (denominators.size !== segments.length || starts !== population.starts))
  )
    return invalidBalance();
  return { population, segments, rows };
}

function parseContext(value: unknown, segmentIds: Set<string>): BalanceContext {
  const row = analyticsRecord(value, CONTEXT_KEYS);
  const result: BalanceContext = {
    id: analyticsText(row.id, 128),
    segmentId: analyticsText(row.segmentId, 128),
    initialComposition: balanceIds(row.initialComposition, 5),
    runeIds: balanceIds(row.runeIds, 3),
    masteryHash: balanceHash(row.masteryHash),
    enhancementHash: balanceHash(row.enhancementHash),
  };
  if (
    !segmentIds.has(result.segmentId) ||
    result.initialComposition.length === 0 ||
    !/^[0-9a-f]{32}$/.test(result.id)
  )
    return invalidBalance();
  return result;
}

function uniqueBy<T>(rows: T[], key: (value: T) => string): void {
  if (new Set(rows.map(key)).size !== rows.length) invalidBalance();
}

function parseBase(
  value: unknown,
  extraKeys: string[],
  expectedFilters?: BalanceFilters,
): { row: Record<string, unknown>; base: BalanceReportBase; contextIds: Set<string> } {
  const row = analyticsRecord(value, [...BASE_KEYS, ...extraKeys]);
  const snapshotAt = analyticsTimestamp(row.snapshotAt);
  const snapshotUs = analyticsTimestampUs(snapshotAt);
  const filters = validateAdminBalanceFilters(row.filters);
  if (expectedFilters && balanceFilterIdentity(filters) !== balanceFilterIdentity(expectedFilters))
    return invalidBalance();
  if (BigInt(analyticsDateMs(filters.to)) * 1000n > snapshotUs) return invalidBalance();
  if (row.minimumSampleSize !== 30) return invalidBalance();
  const segments = analyticsArray(row.segments, 32).map((item) => parseSegment(item, filters));
  uniqueBy(segments, (segment) => segment.id);
  uniqueBy(segments, ({ id: _id, ...identity }) => JSON.stringify(identity));
  const segmentIds = new Set(segments.map((segment) => segment.id));
  const contexts = analyticsArray(row.contexts, 128).map((item) => parseContext(item, segmentIds));
  uniqueBy(contexts, (context) => context.id);
  // PostgreSQL collation may order legacy uppercase IDs differently from JS.
  // Identity is a set; comparison must not depend on either display order.
  uniqueBy(contexts, (context) =>
    JSON.stringify([
      context.segmentId,
      [...context.initialComposition].sort(),
      [...context.runeIds].sort(),
      context.masteryHash,
      context.enhancementHash,
    ]),
  );
  if (new Set(contexts.map((context) => context.segmentId)).size !== segments.length)
    return invalidBalance();
  const rawPopulation = analyticsRecord(row.population, ['verifiedRuns', 'uniquePlayers']);
  const population = {
    verifiedRuns: analyticsCount(rawPopulation.verifiedRuns),
    uniquePlayers: analyticsCount(rawPopulation.uniquePlayers),
  };
  if (
    population.uniquePlayers > population.verifiedRuns ||
    (population.verifiedRuns === 0) !== (population.uniquePlayers === 0) ||
    (population.verifiedRuns === 0) !== (contexts.length === 0)
  )
    return invalidBalance();
  return {
    row,
    base: { snapshotAt, filters, minimumSampleSize: 30, segments, contexts, population },
    contextIds: new Set(contexts.map((context) => context.id)),
  };
}

function parseCounts(row: Record<string, unknown>, base: BalanceReportBase, ids: Set<string>) {
  const result = {
    contextId: analyticsText(row.contextId, 128),
    cohortRuns: analyticsCount(row.cohortRuns),
    cohortPlayers: analyticsCount(row.cohortPlayers),
    runs: analyticsCount(row.runs),
    players: analyticsCount(row.players),
    wins: analyticsCount(row.wins),
  };
  if (
    !ids.has(result.contextId) ||
    result.cohortRuns < 1 ||
    result.cohortPlayers < 1 ||
    result.cohortRuns > base.population.verifiedRuns ||
    result.cohortPlayers > base.population.uniquePlayers ||
    result.cohortPlayers > result.cohortRuns ||
    result.runs > result.cohortRuns ||
    result.players > result.cohortPlayers ||
    result.players > result.runs ||
    result.wins > result.runs ||
    (result.runs === 0) !== (result.players === 0)
  )
    return invalidBalance();
  return result;
}

function validateCohorts(
  rows: { contextId: string; cohortRuns: number; cohortPlayers: number }[],
  base: BalanceReportBase,
  allowMissing = false,
): void {
  const counts = new Map<string, { runs: number; players: number }>();
  for (const row of rows) {
    const previous = counts.get(row.contextId);
    if (previous && (previous.runs !== row.cohortRuns || previous.players !== row.cohortPlayers))
      invalidBalance();
    counts.set(row.contextId, { runs: row.cohortRuns, players: row.cohortPlayers });
  }
  const runs = [...counts.values()].reduce((sum, item) => sum + item.runs, 0);
  if (
    runs > base.population.verifiedRuns ||
    (!allowMissing &&
      (counts.size !== base.contexts.length || runs !== base.population.verifiedRuns))
  )
    invalidBalance();
}

/** No client sorting, row truncation or inferred DPS can change the server population. */
export function parseAdminBalanceChampions(
  value: unknown,
  expectedFilters?: BalanceFilters,
): BalanceChampionReport {
  const { row, base, contextIds } = parseBase(
    value,
    ['metrics', 'selections', 'rows'],
    expectedFilters,
  );
  const selections = parseSelections(row.selections, base.filters);
  const rawMetrics = analyticsRecord(row.metrics, ['damage', 'healing', 'dps', 'crowdControl']);
  const metrics = {
    damage: balanceLiteral(rawMetrics.damage, 'ledger_total'),
    healing: balanceLiteral(rawMetrics.healing, 'ledger_total'),
    dps: balanceLiteral(rawMetrics.dps, 'not_collected'),
    crowdControl: balanceLiteral(rawMetrics.crowdControl, 'not_collected'),
  };
  const rows: BalanceChampionRow[] = analyticsArray(row.rows, 1024).map((value) => {
    const item = analyticsRecord(value, [
      ...COUNTS_KEYS,
      'championId',
      'catalogStatus',
      'survived',
      'ledgerRuns',
      'meanDamageDealt',
      'meanHealingDone',
    ]);
    const result: BalanceChampionRow = {
      ...parseCounts(item, base, contextIds),
      championId: balanceId(item.championId),
      catalogStatus: analyticsEnum(item.catalogStatus, ['known', 'unknown']),
      survived: analyticsCount(item.survived),
      ledgerRuns: analyticsCount(item.ledgerRuns),
      meanDamageDealt: item.meanDamageDealt === null ? null : balanceFinite(item.meanDamageDealt),
      meanHealingDone: item.meanHealingDone === null ? null : balanceFinite(item.meanHealingDone),
    };
    if (
      result.survived > result.runs ||
      result.ledgerRuns > result.runs ||
      (result.ledgerRuns === 0) !== (result.meanDamageDealt === null) ||
      (result.ledgerRuns === 0) !== (result.meanHealingDone === null)
    )
      return invalidBalance();
    return result;
  });
  uniqueBy(rows, (item) => JSON.stringify([item.contextId, item.championId]));
  if (base.filters.championId && rows.some((item) => item.championId !== base.filters.championId))
    return invalidBalance();
  validateCohorts(rows, base, base.filters.championId !== undefined);
  const knownBySegment = new Map<string, string>();
  for (const context of base.contexts) {
    const known = rows
      .filter((item) => item.contextId === context.id && item.catalogStatus === 'known')
      .map((item) => item.championId)
      .sort()
      .join('|');
    const previous = knownBySegment.get(context.segmentId);
    if (previous !== undefined && previous !== known) return invalidBalance();
    knownBySegment.set(context.segmentId, known);
  }
  return { ...base, metrics, selections, rows };
}

export function parseAdminBalanceBuilds(
  value: unknown,
  expectedFilters?: BalanceFilters,
): BalanceBuildReport {
  const { row, base, contextIds } = parseBase(
    value,
    ['itemBasis', 'exposure', 'itemCatalog', 'rows'],
    expectedFilters,
  );
  const rows: BalanceBuildRow[] = analyticsArray(row.rows, 1024).map((value) => {
    const item = analyticsRecord(value, [
      ...COUNTS_KEYS,
      'kind',
      'championId',
      'ids',
      'unknownIds',
      'state',
    ]);
    const kind = analyticsEnum(item.kind, ['items', 'runes', 'augments']);
    const result: BalanceBuildRow = {
      ...parseCounts(item, base, contextIds),
      kind,
      championId: item.championId === null ? null : balanceId(item.championId),
      ids: balanceIds(item.ids, kind === 'augments' ? 20 : 128, kind !== 'augments'),
      unknownIds: balanceIds(item.unknownIds),
      state: analyticsEnum(item.state, ['observed', 'empty', 'partial']),
    };
    if (
      (result.kind === 'items') !== (result.championId !== null) ||
      result.unknownIds.some((id) => !result.ids.includes(id)) ||
      (result.kind === 'items' && result.unknownIds.length > 0) ||
      (result.state === 'empty' && result.ids.length > 0) ||
      (result.state === 'observed' && result.ids.length === 0) ||
      result.runs === 0
    )
      return invalidBalance();
    return result;
  });
  uniqueBy(rows, (item) =>
    JSON.stringify([item.contextId, item.kind, item.championId, item.state, [...item.ids].sort()]),
  );
  validateCohorts(rows, base);
  if (
    base.filters.championId &&
    rows.some((item) => item.kind === 'items' && item.championId !== base.filters.championId)
  )
    return invalidBalance();
  for (const context of base.contexts) {
    const contextRows = rows.filter((item) => item.contextId === context.id);
    const cohortRuns = contextRows[0]?.cohortRuns;
    for (const kind of ['runes', 'augments'] as const) {
      if (
        contextRows
          .filter((item) => item.kind === kind)
          .reduce((sum, item) => sum + item.runs, 0) !== cohortRuns
      )
        return invalidBalance();
    }
    const itemCounts = new Map<string, number>();
    for (const item of contextRows.filter((item) => item.kind === 'items')) {
      const total = (itemCounts.get(item.championId ?? '') ?? 0) + item.runs;
      if (total > item.cohortRuns) return invalidBalance();
      itemCounts.set(item.championId ?? '', total);
    }
  }
  return {
    ...base,
    itemBasis: balanceLiteral(row.itemBasis, 'ever_equipped_set'),
    exposure: balanceLiteral(row.exposure, 'not_collected'),
    itemCatalog: balanceLiteral(row.itemCatalog, 'not_available'),
    rows,
  };
}

export function assertAdminBalanceSnapshot(value: string, expected: string): void {
  if (analyticsTimestampUs(value) !== analyticsTimestampUs(expected)) invalidBalance();
}
