export const ADMIN_PLAYER_SNAPSHOT = '2026-10-17T10:00:00.000Z';

export function adminPlayerFixture(index = 1) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    username: `player-${index}`,
    displayName: index === 1 ? 'Élise%_,.()' : `Player ${index}`,
    level: 1,
    createdAt: '2026-10-01T12:00:00.000Z',
    lastLoginAt: null,
    verifiedRuns: 0,
    verifiedWins: 0,
    candiesBalance: '9007199254740993',
  };
}

export function adminPlayerPageFixture(start = 1, size = 50, total = 123) {
  const count = Math.max(0, Math.min(size, total - start + 1));
  const hasMore = start - 1 + count < total;
  return {
    items: Array.from({ length: count }, (_, offset) => adminPlayerFixture(start + offset)),
    total,
    hasMore,
    nextCursor: hasMore ? { entity: 'players', after: start + count - 1 } : null,
    snapshotAt: ADMIN_PLAYER_SNAPSHOT,
  };
}

export function adminPlayerDetailFixture(index = 1) {
  return {
    profile: adminPlayerFixture(index),
    verifiedStats: { runs: 0, wins: 0, waves: 0, candiesEarned: '0', lastCompletedAt: null },
    mastery: {
      items: [
        {
          championId: 'annie',
          masteryLevel: 2,
          totalCandies: 125,
          currentLevelCandies: 25,
          gamesPlayed: 2,
          gamesWon: 1,
        },
      ],
      total: 1,
      hasMore: false,
    },
    enhancements: {
      items: [{ championId: 'annie', unlockedNodes: { arcane_power: 1 }, totalCandiesSpent: 10 }],
      total: 1,
      hasMore: false,
    },
    candies: {
      balance: '9007199254740993',
      openingBalance: '9007199254740993',
      historyComplete: false,
      reconciled: true,
      earnedSinceLedger: '0',
      spentSinceLedger: '0',
      refundedSinceLedger: '0',
      unattributedSinceLedger: '-2',
      ledgerStartedAt: ADMIN_PLAYER_SNAPSHOT,
      transactions: {
        items: [
          {
            id: 'candy-event-1',
            kind: 'unattributed',
            amount: '-2',
            createdAt: ADMIN_PLAYER_SNAPSHOT,
          },
        ],
        total: 1,
        hasMore: false,
      },
    },
    shards: {
      balance: null,
      ledgerBalance: '0',
      reconciled: null,
      lifetimeEarned: null,
      lifetimeSpent: null,
      transactions: { items: [], total: 0, hasMore: false },
    },
    purchases: {
      items: [
        {
          championId: 'annie',
          unlockedAt: ADMIN_PLAYER_SNAPSHOT,
          source: 'legacy_grant',
          pricePaid: '0',
        },
      ],
      total: 1,
      hasMore: false,
    },
    snapshotAt: ADMIN_PLAYER_SNAPSHOT,
  };
}
