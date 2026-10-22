import {
  analyticsArray,
  analyticsBoolean,
  analyticsCount,
  analyticsEnum,
  analyticsRecord,
  analyticsText,
  analyticsTimestamp,
} from '../analytics/adminAnalyticsValidation';
import { parseAdminBalanceBase } from './adminBalanceReportParser';
import { describeAdminBalanceWinRate } from './adminBalanceStatistics';
import {
  balanceHash,
  balanceId,
  balanceIds,
  balanceLiteral,
  balanceVersion,
  invalidBalance,
} from './adminBalanceValidation';
import type { BalanceFilters } from './balanceTypes';
import type { BalanceTreeBuildRow, BalanceTreeReport } from './treeTypes';

const roles = ['assassin', 'fighter', 'mage', 'marksman', 'support', 'tank'] as const;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const rate = (value: unknown, expected: number | null): number | null => {
  if (expected === null) {
    if (value !== null) invalidBalance();
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1 ||
    !near(value, expected)
  )
    return invalidBalance();
  return value;
};
const unique = (keys: string[]) => {
  if (new Set(keys).size !== keys.length) invalidBalance();
};

export function parseAdminBalanceTrees(
  value: unknown,
  expectedFilters?: BalanceFilters,
): BalanceTreeReport {
  const { row, base, contextIds } = parseAdminBalanceBase(
    value,
    [
      'buildBasis',
      'causalEffect',
      'catalogueBasis',
      'catalogue',
      'purchases',
      'builds',
      'cardinality',
    ],
    expectedFilters,
  );
  const raw = analyticsRecord(row.purchases, [
    'basis',
    'exposure',
    'scope',
    'commands',
    'resets',
    'uniquePurchasers',
    'spent',
    'refunded',
    'attestedSpend',
    'unclassifiedCommands',
    'ledgerComplete',
    'ledgerCoverageStartedAt',
    'nodes',
    'branches',
  ]);
  const commands = analyticsCount(raw.commands),
    uniquePurchasers = analyticsCount(raw.uniquePurchasers),
    unclassifiedCommands = analyticsCount(raw.unclassifiedCommands);
  if (
    uniquePurchasers > commands ||
    (commands === 0) !== (uniquePurchasers === 0) ||
    unclassifiedCommands > commands
  )
    invalidBalance();
  const parsePurchase = (value: unknown, key: 'nodeId' | 'branchId') => {
    const r = analyticsRecord(value, [
      'catalogVersion',
      key,
      'role',
      'championId',
      'purchases',
      'players',
      'purchaserShare',
      'insufficientSample',
    ]);
    const purchases = analyticsCount(r.purchases),
      players = analyticsCount(r.players);
    const catalogVersion = balanceVersion(r.catalogVersion),
      championId = balanceId(r.championId);
    if (
      purchases < 1 ||
      players < 1 ||
      players > purchases ||
      purchases > commands ||
      players > uniquePurchasers ||
      (base.filters.progressionVersion !== undefined &&
        catalogVersion !== base.filters.progressionVersion) ||
      (base.filters.championId !== undefined && championId !== base.filters.championId)
    )
      invalidBalance();
    const insufficientSample = uniquePurchasers < 30 || players < 30;
    if (analyticsBoolean(r.insufficientSample) !== insufficientSample) invalidBalance();
    return {
      catalogVersion,
      id: balanceId(r[key]),
      role: analyticsEnum(r.role, roles),
      championId,
      purchases,
      players,
      purchaserShare: rate(
        r.purchaserShare,
        insufficientSample ? null : players / uniquePurchasers,
      ),
      insufficientSample,
    };
  };
  const nodes = analyticsArray(raw.nodes, 1024).map((v) => {
    const { id, ...r } = parsePurchase(v, 'nodeId');
    return { ...r, nodeId: id };
  });
  const branches = analyticsArray(raw.branches, 1024).map((v) => {
    const { id, ...r } = parsePurchase(v, 'branchId');
    return { ...r, branchId: id };
  });
  unique(nodes.map((n) => `${n.catalogVersion}:${n.championId}:${n.nodeId}`));
  unique(branches.map((n) => `${n.catalogVersion}:${n.championId}:${n.branchId}`));
  if (
    nodes.reduce((n, r) => n + r.purchases, 0) + unclassifiedCommands !== commands ||
    branches.reduce((n, r) => n + r.purchases, 0) + unclassifiedCommands !== commands
  )
    invalidBalance();
  const catalogue = analyticsArray(row.catalogue, 1024).map((v) => {
    const r = analyticsRecord(v, [
      'catalogVersion',
      'nodeId',
      'role',
      'championId',
      'disabledReason',
      'availability',
    ]);
    return {
      catalogVersion: balanceVersion(r.catalogVersion),
      nodeId: balanceId(r.nodeId),
      role: analyticsEnum(r.role, roles),
      championId: r.championId === null ? null : balanceId(r.championId),
      disabledReason: r.disabledReason === null ? null : analyticsText(r.disabledReason, 128),
      availability: analyticsEnum(r.availability, [
        'available',
        'disabled',
        'dependency_blocked',
        'gated',
      ]),
    };
  });
  unique(catalogue.map((n) => `${n.catalogVersion}:${n.nodeId}`));
  const builds: BalanceTreeBuildRow[] = analyticsArray(row.builds, 200).map((v) => {
    const r = analyticsRecord(v, [
      'contextId',
      'segmentId',
      'championId',
      'snapshotHash',
      'ranks',
      'nodeIds',
      'state',
      'runs',
      'players',
      'wins',
      'winRate',
      'interval95',
      'insufficientSample',
      'rateStatus',
    ]);
    const contextId = analyticsText(r.contextId, 128),
      segmentId = analyticsText(r.segmentId, 128),
      championId = balanceId(r.championId);
    const context = base.contexts.find((c) => c.id === contextId);
    if (
      !contextIds.has(contextId) ||
      context?.segmentId !== segmentId ||
      (base.filters.championId !== undefined && championId !== base.filters.championId)
    )
      invalidBalance();
    const runs = analyticsCount(r.runs),
      players = analyticsCount(r.players),
      wins = analyticsCount(r.wins);
    if (
      runs < 1 ||
      players < 1 ||
      wins > runs ||
      players > runs ||
      runs > base.population.verifiedRuns ||
      players > base.population.uniquePlayers
    )
      invalidBalance();
    const ranks = Object.fromEntries(
      Object.entries(analyticsRecord(r.ranks)).map(([id, rank]) => {
        const n = analyticsCount(rank);
        if (n < 1) invalidBalance();
        return [balanceId(id), n];
      }),
    );
    const nodeIds = balanceIds(r.nodeIds, 1024);
    if (JSON.stringify([...nodeIds].sort()) !== JSON.stringify(Object.keys(ranks).sort()))
      invalidBalance();
    const state = analyticsEnum(r.state, ['observed', 'empty', 'partial']);
    if (
      (state === 'empty' && nodeIds.length !== 0) ||
      (state === 'observed' && nodeIds.length === 0)
    )
      invalidBalance();
    const insufficientSample = players < 30 || runs < 30 || state === 'partial';
    const rateStatus = insufficientSample
      ? 'insufficient_sample'
      : players < runs
        ? 'repeated_players'
        : 'descriptive';
    if (
      analyticsBoolean(r.insufficientSample) !== insufficientSample ||
      r.rateStatus !== rateStatus
    )
      invalidBalance();
    const observed = describeAdminBalanceWinRate(wins, runs, players);
    const expectedInterval = insufficientSample ? null : observed.interval95;
    let interval95: null | { lower: number; upper: number } = null;
    if (expectedInterval === null) {
      if (r.interval95 !== null) invalidBalance();
    } else {
      const i = analyticsRecord(r.interval95, ['lower', 'upper']);
      interval95 = {
        lower: rate(i.lower, expectedInterval.lower)!,
        upper: rate(i.upper, expectedInterval.upper)!,
      };
    }
    return {
      contextId,
      segmentId,
      championId,
      snapshotHash: balanceHash(r.snapshotHash),
      ranks,
      nodeIds,
      state,
      runs,
      players,
      wins,
      winRate: rate(r.winRate, insufficientSample ? null : wins / runs),
      interval95,
      insufficientSample,
      rateStatus,
    };
  });
  unique(builds.map((b) => `${b.contextId}:${b.championId}:${b.snapshotHash}:${b.state}`));
  const cardinality = analyticsRecord(row.cardinality, [
    'buildLimit',
    'totalBuilds',
    'buildsTruncated',
  ]);
  const totalBuilds = analyticsCount(cardinality.totalBuilds),
    buildsTruncated = analyticsBoolean(cardinality.buildsTruncated);
  if (
    cardinality.buildLimit !== 200 ||
    builds.length !== Math.min(totalBuilds, 200) ||
    buildsTruncated !== totalBuilds > 200
  )
    invalidBalance();
  const spent = analyticsCount(raw.spent),
    refunded = analyticsCount(raw.refunded),
    attestedSpend = raw.attestedSpend === null ? null : analyticsCount(raw.attestedSpend),
    ledgerComplete = analyticsBoolean(raw.ledgerComplete);
  if (ledgerComplete && (attestedSpend === null || spent !== attestedSpend)) invalidBalance();
  return {
    ...base,
    buildBasis: balanceLiteral(row.buildBasis, 'frozen_attempt_snapshot'),
    causalEffect: balanceLiteral(row.causalEffect, 'not_measured'),
    catalogueBasis: balanceLiteral(row.catalogueBasis, 'current_active_contract'),
    catalogue,
    purchases: {
      basis: balanceLiteral(raw.basis, 'share_of_purchasers'),
      exposure: balanceLiteral(raw.exposure, 'not_collected'),
      scope: balanceLiteral(raw.scope, 'date_progression_champion'),
      commands,
      resets: analyticsCount(raw.resets),
      uniquePurchasers,
      spent,
      refunded,
      attestedSpend,
      unclassifiedCommands,
      ledgerComplete,
      ledgerCoverageStartedAt: analyticsTimestamp(raw.ledgerCoverageStartedAt),
      nodes,
      branches,
    },
    builds,
    cardinality: { buildLimit: 200, totalBuilds, buildsTruncated },
  };
}
