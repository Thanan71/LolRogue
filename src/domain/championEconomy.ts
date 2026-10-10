import type {
  ChampionAccess,
  ChampionEconomyCatalogEntry,
  ChampionEconomySnapshot,
  ChampionRotation,
  ShardReward,
  ShardRewardInput,
} from '../types/championEconomy';

export const CHAMPION_ECONOMY_VERSION = 1 as const;
export const CHAMPION_CATALOG_VERSION = 2 as const;
export const CHAMPION_ROTATION_ALGORITHM_VERSION = 1 as const;
export const CHAMPION_PRICE_SHARDS = 400;
export const CHAMPION_ROTATION_SIZE = 5;
export const PERMANENT_FREE_CHAMPION_IDS: readonly string[] = ['Garen', 'Annie', 'Ashe'];
/** Immutable v1 pool; a new gameplay catalogue must explicitly publish its version. */
export const ECONOMY_V1_CHAMPION_IDS: readonly string[] = [
  'Annie',
  'Ashe',
  'Darius',
  'Garen',
  'Jinx',
  'Leona',
  'Lux',
  'Malphite',
  'Soraka',
  'Warwick',
];
/** v1 remains frozen for existing access snapshots and rotation contracts. */
export const ECONOMY_V2_CHAMPION_IDS: readonly string[] = [...ECONOMY_V1_CHAMPION_IDS, 'Veigar'];
export const CHAMPION_ECONOMY_CATALOG: readonly ChampionEconomyCatalogEntry[] =
  ECONOMY_V2_CHAMPION_IDS.map((championId) => ({
    championId,
    priceShards: CHAMPION_PRICE_SHARDS,
    permanentFree: PERMANENT_FREE_CHAMPION_IDS.includes(championId),
  }));

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;
const ROTATION_EPOCH = Date.UTC(2026, 0, 5);

/** Resolve a UTC week from a trusted server instant, never a browser wall clock. */
export function getRotationForInstant(
  serverNow: string | number,
  gameplayRulesetVersion: number,
  allowedChampionIds: readonly string[] = gameplayRulesetVersion >= 22
    ? ECONOMY_V2_CHAMPION_IDS
    : ECONOMY_V1_CHAMPION_IDS,
): ChampionRotation {
  const instant = typeof serverNow === 'string' ? Date.parse(serverNow) : serverNow;
  if (
    !Number.isFinite(instant) ||
    !Number.isSafeInteger(gameplayRulesetVersion) ||
    gameplayRulesetVersion < 1
  ) {
    throw new Error('invalid_rotation_input');
  }
  const date = new Date(instant);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const startsAt = midnight - ((date.getUTCDay() + 6) % 7) * DAY_MS;
  const thursday = new Date(startsAt + DAY_MS * 3);
  const isoYear = thursday.getUTCFullYear();
  const januaryFourth = new Date(Date.UTC(isoYear, 0, 4));
  const firstMonday = januaryFourth.getTime() - ((januaryFourth.getUTCDay() + 6) % 7) * DAY_MS;
  const isoWeek = Math.floor((startsAt - firstMonday) / WEEK_MS) + 1;
  const pool = [...new Set(allowedChampionIds)]
    .filter((id) => !PERMANENT_FREE_CHAMPION_IDS.includes(id))
    .sort();
  const weekOffset = Math.floor((startsAt - ROTATION_EPOCH) / WEEK_MS);
  const offset = pool.length ? ((weekOffset % pool.length) + pool.length) % pool.length : 0;
  const championIds = Array.from(
    { length: Math.min(CHAMPION_ROTATION_SIZE, pool.length) },
    (_, index) => pool[(offset + index) % pool.length],
  );
  return {
    id: `${isoYear}-W${String(isoWeek).padStart(2, '0')}-v1-r${gameplayRulesetVersion}`,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + WEEK_MS).toISOString(),
    championIds,
    rulesetVersion: gameplayRulesetVersion,
    algorithmVersion: CHAMPION_ROTATION_ALGORITHM_VERSION,
  };
}

/** The same precedence is used by collection, selection and server policy parity tests. */
export function getChampionAccess(
  championId: string,
  snapshot: ChampionEconomySnapshot,
  serverNow: number = Date.parse(snapshot.serverNow),
): ChampionAccess {
  const entry = snapshot.catalog.find((candidate) => candidate.championId === championId);
  if (!entry) return 'locked';
  if (!snapshot.enabled || entry.permanentFree) return 'permanent_free';
  if (snapshot.ownedChampionIds.includes(championId)) return 'owned';
  const rotation = snapshot.rotation;
  if (
    rotation &&
    Number.isFinite(serverNow) &&
    serverNow >= Date.parse(rotation.startsAt) &&
    serverNow < Date.parse(rotation.endsAt) &&
    rotation.championIds.includes(championId)
  ) {
    return 'weekly_rotation';
  }
  return 'locked';
}

/** Pure reward contract. Call only with replay-derived metrics after verification. */
export function calculateShardReward(input: ShardRewardInput): ShardReward {
  if (
    !Number.isSafeInteger(input.wavesCompleted) ||
    input.wavesCompleted < 0 ||
    !Number.isSafeInteger(input.biomesCompleted) ||
    input.biomesCompleted < 0 ||
    input.biomesCompleted > 6 ||
    (input.wavesCompleted === 0 && (input.biomesCompleted > 0 || input.won))
  ) {
    throw new Error('invalid_shard_reward_input');
  }
  const baseShards =
    input.wavesCompleted === 0 ? 0 : 25 + input.biomesCompleted * 10 + (input.won ? 50 : 0);
  const firstWinChampionIds = input.won
    ? [...new Set(input.teamChampionIds)]
        .filter(
          (id) => input.rotationChampionIds.includes(id) && !input.claimedChampionIds.includes(id),
        )
        .sort()
    : [];
  const firstWinShards = firstWinChampionIds.length * 50;
  return {
    economyVersion: CHAMPION_ECONOMY_VERSION,
    baseShards,
    firstWinChampionIds,
    firstWinShards,
    totalShards: baseShards + firstWinShards,
  };
}
