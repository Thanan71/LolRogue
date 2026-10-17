import type {
  AdminPlayerCollection,
  AdminPlayerDetail,
  AdminPlayerInteger,
  AdminPlayerListItem,
} from './adminPlayerTypes';

function invalid(): never {
  throw new Error('Invalid admin player projection.');
}

export function playerRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

export function playerText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : invalid();
}

export function playerId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    return invalid();
  return value;
}

export function playerInteger(value: unknown, signed = false): AdminPlayerInteger {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value) && (signed || value >= 0))
    return String(value);
  if (typeof value === 'string' && (signed ? /^-?\d+$/ : /^\d+$/).test(value)) return value;
  return invalid();
}

export function playerTimestamp(value: unknown): string | null {
  const text = playerText(value);
  if (text === null) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(text) ||
    !/(?:Z|[+-]00:00)$/.test(text) ||
    !Number.isFinite(Date.parse(text))
  )
    return invalid();
  return text;
}

export function parseAdminPlayerItem(value: unknown): AdminPlayerListItem {
  const item = playerRecord(value);
  return {
    id: playerId(item.id),
    username: playerText(item.username),
    displayName: playerText(item.displayName),
    level: playerInteger(item.level),
    createdAt: playerTimestamp(item.createdAt),
    lastLoginAt: playerTimestamp(item.lastLoginAt),
    verifiedRuns: playerInteger(item.verifiedRuns),
    verifiedWins: playerInteger(item.verifiedWins),
    candiesBalance: playerInteger(item.candiesBalance),
  };
}

function textRequired(value: unknown): string {
  const text = playerText(value);
  return text ? text : invalid();
}

function nullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined
    ? null
    : typeof value === 'boolean'
      ? value
      : invalid();
}

function member<K extends string>(value: unknown, allowed: readonly K[]): K {
  return typeof value === 'string' && allowed.some((item) => item === value)
    ? (value as K)
    : invalid();
}

function collection<T>(
  value: unknown,
  parse: (item: unknown) => T,
  maximum: number,
): AdminPlayerCollection<T> {
  const record = playerRecord(value);
  if (
    !Array.isArray(record.items) ||
    record.items.length > maximum ||
    !Number.isSafeInteger(record.total) ||
    typeof record.total !== 'number' ||
    record.total < record.items.length ||
    typeof record.hasMore !== 'boolean' ||
    record.hasMore !== record.total > record.items.length
  )
    return invalid();
  return { items: record.items.map(parse), total: record.total, hasMore: record.hasMore };
}

export function parseAdminPlayerDetail(value: unknown): AdminPlayerDetail {
  const detail = playerRecord(value);
  const stats = playerRecord(detail.verifiedStats);
  const candies = playerRecord(detail.candies);
  const shards = playerRecord(detail.shards);
  const snapshotAt = playerTimestamp(detail.snapshotAt);
  if (snapshotAt === null) return invalid();
  return {
    profile: parseAdminPlayerItem(detail.profile),
    verifiedStats: {
      runs: playerInteger(stats.runs),
      wins: playerInteger(stats.wins),
      waves: playerInteger(stats.waves),
      candiesEarned: playerInteger(stats.candiesEarned),
      lastCompletedAt: playerTimestamp(stats.lastCompletedAt),
    },
    mastery: collection(
      detail.mastery,
      (value) => {
        const item = playerRecord(value);
        return {
          championId: textRequired(item.championId),
          masteryLevel: playerInteger(item.masteryLevel),
          totalCandies: playerInteger(item.totalCandies),
          currentLevelCandies: playerInteger(item.currentLevelCandies),
          gamesPlayed: playerInteger(item.gamesPlayed),
          gamesWon: playerInteger(item.gamesWon),
        };
      },
      200,
    ),
    enhancements: collection(
      detail.enhancements,
      (value) => {
        const item = playerRecord(value);
        const nodes = playerRecord(item.unlockedNodes);
        const unlockedNodes: Record<string, string> = {};
        for (const [key, rank] of Object.entries(nodes)) {
          const parsed = playerInteger(rank);
          if (parsed === null) return invalid();
          Object.defineProperty(unlockedNodes, key, { value: parsed, enumerable: true });
        }
        return {
          championId: textRequired(item.championId),
          unlockedNodes,
          totalCandiesSpent: playerInteger(item.totalCandiesSpent),
        };
      },
      200,
    ),
    candies: {
      balance: playerInteger(candies.balance),
      openingBalance: playerInteger(candies.openingBalance),
      historyComplete: nullableBoolean(candies.historyComplete),
      reconciled: nullableBoolean(candies.reconciled),
      earnedSinceLedger: playerInteger(candies.earnedSinceLedger),
      spentSinceLedger: playerInteger(candies.spentSinceLedger),
      refundedSinceLedger: playerInteger(candies.refundedSinceLedger),
      unattributedSinceLedger: playerInteger(candies.unattributedSinceLedger, true),
      ledgerStartedAt: playerTimestamp(candies.ledgerStartedAt),
      transactions: collection(
        candies.transactions,
        (value) => {
          const item = playerRecord(value);
          return {
            id: textRequired(item.id),
            kind: member(item.kind, ['earned', 'spent', 'refunded', 'unattributed']),
            amount: playerInteger(item.amount, true),
            createdAt: playerTimestamp(item.createdAt),
          };
        },
        50,
      ),
    },
    shards: {
      balance: playerInteger(shards.balance),
      ledgerBalance: playerInteger(shards.ledgerBalance, true),
      reconciled: nullableBoolean(shards.reconciled),
      lifetimeEarned: playerInteger(shards.lifetimeEarned),
      lifetimeSpent: playerInteger(shards.lifetimeSpent),
      transactions: collection(
        shards.transactions,
        (value) => {
          const item = playerRecord(value);
          return {
            id: textRequired(item.id),
            amount: playerInteger(item.amount, true),
            balanceAfter: playerInteger(item.balanceAfter),
            reason: playerText(item.reason),
            championId: playerText(item.championId),
            createdAt: playerTimestamp(item.createdAt),
          };
        },
        50,
      ),
    },
    purchases: collection(
      detail.purchases,
      (value) => {
        const item = playerRecord(value);
        return {
          championId: textRequired(item.championId),
          unlockedAt: playerTimestamp(item.unlockedAt),
          source: member(item.source, ['purchase', 'legacy_grant', 'admin_grant']),
          pricePaid: playerInteger(item.pricePaid),
        };
      },
      50,
    ),
    snapshotAt,
  };
}
