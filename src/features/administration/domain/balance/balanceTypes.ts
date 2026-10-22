import type { AnalyticsSegment } from '../analytics/analyticsTypes';

/** Public, bounded UTC filters. All rows remain split by exact authority identity. */
export interface BalanceFilters {
  from: string;
  to: string;
  engineVersion?: string;
  gameplayVersion?: number;
  progressionVersion?: number;
  commandVersion?: number;
  contentHash?: string;
  mode?: 'all' | 'normal' | 'daily';
  difficulty?: 'all' | 'easy' | 'normal' | 'hard';
  championId?: string;
}

export interface BalanceContext {
  id: string;
  segmentId: string;
  initialComposition: string[];
  runeIds: string[];
  masteryHash: string;
  enhancementHash: string;
}

export interface BalancePopulation {
  verifiedRuns: number;
  uniquePlayers: number;
}

export interface BalanceReportBase {
  snapshotAt: string;
  filters: BalanceFilters;
  minimumSampleSize: 30;
  /** Fully assigned exact identity tuples; never an unassigned analytics segment. */
  segments: AnalyticsSegment[];
  contexts: BalanceContext[];
  population: BalancePopulation;
}

/** Participation is final membership among verified finishes, not selection intent. */
export interface BalanceChampionRow {
  contextId: string;
  championId: string;
  catalogStatus: 'known' | 'unknown';
  cohortRuns: number;
  cohortPlayers: number;
  runs: number;
  players: number;
  wins: number;
  survived: number;
  ledgerRuns: number;
  meanDamageDealt: number | null;
  meanHealingDone: number | null;
}

export interface BalanceChampionReport extends BalanceReportBase {
  /** Attempt starts use their own UTC clock and population, including abandonments. */
  selections: BalanceSelections;
  metrics: {
    damage: 'ledger_total';
    healing: 'ledger_total';
    dps: 'not_collected';
    crowdControl: 'not_collected';
  };
  rows: BalanceChampionRow[];
}

export interface BalanceSelectionRow {
  segmentId: string;
  championId: string;
  catalogStatus: 'known' | 'unknown';
  cohortStarts: number;
  cohortPlayers: number;
  starts: number;
  players: number;
}

export interface BalanceSelections {
  population: { starts: number; uniquePlayers: number };
  segments: AnalyticsSegment[];
  rows: BalanceSelectionRow[];
}

export interface BalanceBuildRow {
  contextId: string;
  kind: 'items' | 'runes' | 'augments';
  championId: string | null;
  /** Augments retain repeated IDs for acquired stacks; items/runes are sets. */
  ids: string[];
  unknownIds: string[];
  state: 'observed' | 'empty' | 'partial';
  cohortRuns: number;
  cohortPlayers: number;
  runs: number;
  players: number;
  wins: number;
}

/** Observed loadouts have no availability/exposure denominator or causal effect. */
export interface BalanceBuildReport extends BalanceReportBase {
  itemBasis: 'ever_equipped_set';
  exposure: 'not_collected';
  itemCatalog: 'not_available';
  rows: BalanceBuildRow[];
}

export interface BalanceGameplayRuleset {
  version: number;
  code: string;
  engineVersion: string;
  commandVersion: number;
  contentHash: string;
  active: boolean;
}

export interface BalanceProgressionRuleset {
  version: number;
  code: string;
  active: boolean;
}

export interface BalanceConfig {
  snapshotAt: string;
  readOnly: true;
  gameplayRulesets: BalanceGameplayRuleset[];
  progressionRulesets: BalanceProgressionRuleset[];
  championEconomy: {
    enabled: boolean;
    economyVersion: number;
    catalogVersion: number;
    gameplayVersion: number;
    activatedAt: string | null;
    updatedAt: string;
  } | null;
  trees:
    | { status: 'dependency_unavailable'; dependency: 'TREE-10' }
    | { status: 'available'; catalogVersion: number; contractSchemaVersion: 1 };
  unsupportedMetrics: ['dps', 'crowd_control_duration', 'item_exposure'];
  minimumSampleSize: 30;
}
