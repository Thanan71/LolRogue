/** Account ownership is separate from champion mastery and run gold. */
export type ChampionAccess = 'permanent_free' | 'owned' | 'weekly_rotation' | 'locked';

export interface ChampionEconomyCatalogEntry {
  championId: string;
  priceShards: number;
  permanentFree: boolean;
}

export interface ChampionRotation {
  id: string;
  startsAt: string;
  endsAt: string;
  championIds: string[];
  rulesetVersion: number;
  algorithmVersion: number;
}

export interface AccountWallet {
  shardsBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
}

export interface ChampionEconomySnapshot {
  enabled: boolean;
  economyVersion: number;
  catalogVersion: number;
  gameplayRulesetVersion: number;
  serverNow: string;
  rotation: ChampionRotation | null;
  catalog: ChampionEconomyCatalogEntry[];
  wallet: AccountWallet | null;
  ownedChampionIds: string[];
  firstWinChampionIds: string[];
}

export interface ChampionRunAccessSnapshot {
  version: 1;
  enabled: boolean;
  economyVersion: 1 | null;
  catalogVersion: number;
  rotationId: string | null;
  rotationStartsAt: string | null;
  rotationEndsAt: string | null;
  allowedChampionIds: string[];
  rotationChampionIds: string[];
}

export interface ChampionPurchaseQuote {
  priceShards: number;
  economyVersion: number;
  catalogVersion: number;
}

export interface ChampionPurchaseResult {
  replayed: boolean;
  snapshot: ChampionEconomySnapshot;
}

export interface ShardRewardInput {
  wavesCompleted: number;
  biomesCompleted: number;
  won: boolean;
  rotationChampionIds: readonly string[];
  teamChampionIds: readonly string[];
  claimedChampionIds: readonly string[];
}

export interface ShardReward {
  economyVersion: 1;
  baseShards: number;
  firstWinChampionIds: string[];
  firstWinShards: number;
  totalShards: number;
}
