export interface AdminPlayerFilters {
  search: string;
  registeredFrom: string;
  registeredTo: string;
  activeFrom: string;
  activeTo: string;
  verifiedRuns: 'all' | 'none' | 'some';
  accountState: 'all' | 'registered' | 'guest';
}

export const DEFAULT_ADMIN_PLAYER_FILTERS: AdminPlayerFilters = {
  search: '',
  registeredFrom: '',
  registeredTo: '',
  activeFrom: '',
  activeTo: '',
  verifiedRuns: 'all',
  accountState: 'all',
};

export type AdminPlayerInteger = string | null;

export interface AdminPlayerListItem {
  id: string;
  username: string | null;
  displayName: string | null;
  level: AdminPlayerInteger;
  createdAt: string | null;
  lastLoginAt: string | null;
  verifiedRuns: AdminPlayerInteger;
  verifiedWins: AdminPlayerInteger;
  candiesBalance: AdminPlayerInteger;
}

export interface AdminPlayerCollection<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface AdminPlayerMastery {
  championId: string;
  masteryLevel: AdminPlayerInteger;
  totalCandies: AdminPlayerInteger;
  currentLevelCandies: AdminPlayerInteger;
  gamesPlayed: AdminPlayerInteger;
  gamesWon: AdminPlayerInteger;
}

export interface AdminPlayerEnhancement {
  championId: string;
  unlockedNodes: Record<string, string>;
  totalCandiesSpent: AdminPlayerInteger;
}

export interface AdminCandyEvent {
  id: string;
  kind: 'earned' | 'spent' | 'refunded' | 'unattributed';
  amount: AdminPlayerInteger;
  createdAt: string | null;
}

export interface AdminShardEvent {
  id: string;
  amount: AdminPlayerInteger;
  balanceAfter: AdminPlayerInteger;
  reason: string | null;
  championId: string | null;
  createdAt: string | null;
}

export interface AdminChampionPurchase {
  championId: string;
  unlockedAt: string | null;
  source: 'purchase' | 'legacy_grant' | 'admin_grant';
  pricePaid: AdminPlayerInteger;
}

export interface AdminPlayerDetail {
  profile: AdminPlayerListItem;
  verifiedStats: {
    runs: AdminPlayerInteger;
    wins: AdminPlayerInteger;
    waves: AdminPlayerInteger;
    candiesEarned: AdminPlayerInteger;
    lastCompletedAt: string | null;
  };
  mastery: AdminPlayerCollection<AdminPlayerMastery>;
  enhancements: AdminPlayerCollection<AdminPlayerEnhancement>;
  candies: {
    balance: AdminPlayerInteger;
    openingBalance: AdminPlayerInteger;
    historyComplete: boolean | null;
    reconciled: boolean | null;
    earnedSinceLedger: AdminPlayerInteger;
    spentSinceLedger: AdminPlayerInteger;
    refundedSinceLedger: AdminPlayerInteger;
    unattributedSinceLedger: AdminPlayerInteger;
    ledgerStartedAt: string | null;
    transactions: AdminPlayerCollection<AdminCandyEvent>;
  };
  shards: {
    balance: AdminPlayerInteger;
    ledgerBalance: AdminPlayerInteger;
    reconciled: boolean | null;
    lifetimeEarned: AdminPlayerInteger;
    lifetimeSpent: AdminPlayerInteger;
    transactions: AdminPlayerCollection<AdminShardEvent>;
  };
  purchases: AdminPlayerCollection<AdminChampionPurchase>;
  snapshotAt: string;
}

export function adminPlayerDateBoundary(value: string): string | null {
  if (!value) return null;
  const iso = `${value}T00:00:00.000Z`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(iso))) return null;
  return new Date(iso).toISOString() === iso ? iso : null;
}

export function adminPlayerDatesValid(filters: AdminPlayerFilters): boolean {
  return (
    [filters.registeredFrom, filters.registeredTo, filters.activeFrom, filters.activeTo].every(
      (value) => !value || adminPlayerDateBoundary(value) !== null,
    ) &&
    (!filters.registeredFrom ||
      !filters.registeredTo ||
      filters.registeredFrom < filters.registeredTo) &&
    (!filters.activeFrom || !filters.activeTo || filters.activeFrom < filters.activeTo)
  );
}
