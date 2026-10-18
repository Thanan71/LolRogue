import type {
  BalanceBuildReport,
  BalanceChampionReport,
  BalanceConfig,
  BalanceFilters,
  BalanceReportBase,
} from '@/pages/admin/balance/balanceTypes';

const CONTEXT_ID = 'b'.repeat(32);

function base(filters: BalanceFilters): BalanceReportBase {
  return {
    snapshotAt: new Date(Date.parse(`${filters.to}T00:00:00Z`) + 36 * 3_600_000).toISOString(),
    filters: { ...filters },
    minimumSampleSize: 30,
    segments: [
      {
        id: 'segment-1',
        engineVersion: filters.engineVersion ?? 'run-engine-0.2.5',
        gameplayVersion: filters.gameplayVersion ?? 24,
        progressionVersion: filters.progressionVersion ?? 3,
        commandVersion: filters.commandVersion ?? 1,
        contentHash: filters.contentHash ?? 'a'.repeat(64),
        mode: filters.mode === 'daily' ? 'daily' : 'normal',
        difficulty:
          filters.difficulty === 'easy' || filters.difficulty === 'hard'
            ? filters.difficulty
            : 'normal',
      },
    ],
    contexts: [
      {
        id: CONTEXT_ID,
        segmentId: 'segment-1',
        initialComposition: ['garen'],
        runeIds: [],
        masteryHash: 'c'.repeat(64),
        enhancementHash: 'd'.repeat(64),
      },
    ],
    population: { verifiedRuns: 2, uniquePlayers: 1 },
  };
}

export function balanceChampionFixture(
  filters: BalanceFilters = { from: '2026-10-01', to: '2026-10-17' },
): BalanceChampionReport {
  const result: BalanceChampionReport = {
    ...base(filters),
    selections: {
      population: { starts: 3, uniquePlayers: 2 },
      segments: base(filters).segments,
      rows: [
        {
          segmentId: 'segment-1',
          championId: 'ahri',
          catalogStatus: 'known',
          cohortStarts: 3,
          cohortPlayers: 2,
          starts: 0,
          players: 0,
        },
        {
          segmentId: 'segment-1',
          championId: 'garen',
          catalogStatus: 'known',
          cohortStarts: 3,
          cohortPlayers: 2,
          starts: 3,
          players: 2,
        },
      ],
    },
    metrics: {
      damage: 'ledger_total',
      healing: 'ledger_total',
      dps: 'not_collected',
      crowdControl: 'not_collected',
    },
    rows: [
      {
        contextId: CONTEXT_ID,
        championId: 'ahri',
        catalogStatus: 'known',
        cohortRuns: 2,
        cohortPlayers: 1,
        runs: 0,
        players: 0,
        wins: 0,
        survived: 0,
        ledgerRuns: 0,
        meanDamageDealt: null,
        meanHealingDone: null,
      },
      {
        contextId: CONTEXT_ID,
        championId: 'garen',
        catalogStatus: 'known',
        cohortRuns: 2,
        cohortPlayers: 1,
        runs: 2,
        players: 1,
        wins: 1,
        survived: 1,
        ledgerRuns: 1,
        meanDamageDealt: 150,
        meanHealingDone: 0,
      },
    ],
  };
  if (filters.championId)
    result.rows = result.rows.filter((row) => row.championId === filters.championId);
  if (filters.championId)
    result.selections.rows = result.selections.rows.filter(
      (row) => row.championId === filters.championId,
    );
  return result;
}

export function balanceBuildFixture(
  filters: BalanceFilters = { from: '2026-10-01', to: '2026-10-17' },
): BalanceBuildReport {
  return {
    ...base(filters),
    itemBasis: 'ever_equipped_set',
    exposure: 'not_collected',
    itemCatalog: 'not_available',
    rows: [
      {
        contextId: CONTEXT_ID,
        kind: 'items',
        championId: 'garen',
        ids: ['sword'],
        unknownIds: [],
        state: 'observed',
        cohortRuns: 2,
        cohortPlayers: 1,
        runs: 1,
        players: 1,
        wins: 1,
      },
      {
        contextId: CONTEXT_ID,
        kind: 'items',
        championId: 'garen',
        ids: [],
        unknownIds: [],
        state: 'partial',
        cohortRuns: 2,
        cohortPlayers: 1,
        runs: 1,
        players: 1,
        wins: 0,
      },
      ...(['runes', 'augments'] as const).map((kind) => ({
        contextId: CONTEXT_ID,
        kind,
        championId: null,
        ids: [],
        unknownIds: [],
        state: 'empty' as const,
        cohortRuns: 2,
        cohortPlayers: 1,
        runs: 2,
        players: 1,
        wins: 1,
      })),
    ],
  };
}

export function balanceConfigFixture(): BalanceConfig {
  return {
    snapshotAt: '2026-10-18T12:00:00Z',
    readOnly: true,
    minimumSampleSize: 30,
    gameplayRulesets: [
      {
        version: 24,
        code: 'gameplay-0.2.5',
        engineVersion: 'run-engine-0.2.5',
        commandVersion: 1,
        contentHash: 'a'.repeat(64),
        active: true,
      },
    ],
    progressionRulesets: [{ version: 3, code: 'progression-v3', active: true }],
    championEconomy: {
      enabled: false,
      economyVersion: 1,
      catalogVersion: 2,
      gameplayVersion: 24,
      activatedAt: null,
      updatedAt: '2026-10-17T00:00:00Z',
    },
    trees: { status: 'dependency_unavailable', dependency: 'TREE-10' },
    unsupportedMetrics: ['dps', 'crowd_control_duration', 'item_exposure'],
  };
}
