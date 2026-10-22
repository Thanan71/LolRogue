import type { BalanceTreeReport } from '@/features/administration/domain/balance/treeTypes';
import { balanceBuildFixture } from './adminBalanceUi';

export function balanceTreeFixture(): BalanceTreeReport {
  const source = balanceBuildFixture();
  return {
    snapshotAt: source.snapshotAt,
    filters: source.filters,
    minimumSampleSize: 30,
    segments: source.segments,
    contexts: source.contexts,
    population: source.population,
    buildBasis: 'frozen_attempt_snapshot',
    causalEffect: 'not_measured',
    catalogueBasis: 'current_active_contract',
    catalogue: [
      {
        catalogVersion: 4,
        nodeId: 'fighter_core_1',
        role: 'fighter',
        championId: null,
        disabledReason: null,
        availability: 'available',
      },
    ],
    purchases: {
      basis: 'share_of_purchasers',
      exposure: 'not_collected',
      scope: 'date_progression_champion',
      commands: 2,
      resets: 1,
      uniquePurchasers: 1,
      spent: 40,
      refunded: 20,
      attestedSpend: 40,
      unclassifiedCommands: 0,
      ledgerComplete: true,
      ledgerCoverageStartedAt: '2026-10-01T00:00:00Z',
      nodes: [
        {
          catalogVersion: 4,
          nodeId: 'fighter_core_1',
          role: 'fighter',
          championId: 'Garen',
          purchases: 2,
          players: 1,
          purchaserShare: null,
          insufficientSample: true,
        },
      ],
      branches: [
        {
          catalogVersion: 4,
          branchId: 'fighter_core',
          role: 'fighter',
          championId: 'Garen',
          purchases: 2,
          players: 1,
          purchaserShare: null,
          insufficientSample: true,
        },
      ],
    },
    builds: [
      {
        contextId: source.contexts[0].id,
        segmentId: source.segments[0].id,
        championId: 'Garen',
        snapshotHash: 'e'.repeat(64),
        ranks: { fighter_core_1: 1 },
        nodeIds: ['fighter_core_1'],
        state: 'observed',
        runs: 2,
        players: 1,
        wins: 1,
        winRate: null,
        interval95: null,
        insufficientSample: true,
        rateStatus: 'insufficient_sample',
      },
    ],
    cardinality: { buildLimit: 200, totalBuilds: 1, buildsTruncated: false },
  };
}
