import type { BalanceReportBase } from './balanceTypes';

export interface BalanceTreePurchaseRow {
  catalogVersion: number;
  nodeId: string;
  role: string;
  championId: string;
  purchases: number;
  players: number;
  purchaserShare: number | null;
  insufficientSample: boolean;
}
export interface BalanceTreeBranchRow extends Omit<BalanceTreePurchaseRow, 'nodeId'> {
  branchId: string;
}
export interface BalanceTreeBuildRow {
  contextId: string;
  segmentId: string;
  championId: string;
  snapshotHash: string;
  ranks: Record<string, number>;
  nodeIds: string[];
  state: 'observed' | 'empty' | 'partial';
  runs: number;
  players: number;
  wins: number;
  winRate: number | null;
  interval95: { lower: number; upper: number } | null;
  insufficientSample: boolean;
  rateStatus: 'insufficient_sample' | 'repeated_players' | 'descriptive';
}
export interface BalanceTreeReport extends BalanceReportBase {
  buildBasis: 'frozen_attempt_snapshot';
  causalEffect: 'not_measured';
  catalogueBasis: 'current_active_contract';
  catalogue: {
    catalogVersion: number;
    nodeId: string;
    role: string;
    championId: string | null;
    disabledReason: string | null;
    availability: 'available' | 'disabled' | 'dependency_blocked' | 'gated';
  }[];
  purchases: {
    basis: 'share_of_purchasers';
    exposure: 'not_collected';
    scope: 'date_progression_champion';
    commands: number;
    resets: number;
    uniquePurchasers: number;
    spent: number;
    refunded: number;
    attestedSpend: number | null;
    unclassifiedCommands: number;
    ledgerComplete: boolean;
    ledgerCoverageStartedAt: string;
    nodes: BalanceTreePurchaseRow[];
    branches: BalanceTreeBranchRow[];
  };
  builds: BalanceTreeBuildRow[];
  cardinality: { buildLimit: 200; totalBuilds: number; buildsTruncated: boolean };
}
