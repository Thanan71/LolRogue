import type {
  AdminAttemptItem,
  AdminRunItem,
} from '@/features/administration/domain/runs/adminRunContracts';

export const runSnapshot = '2026-10-17T10:00:00.000Z';

export function adminRunFixture(overrides: Partial<AdminRunItem> = {}): AdminRunItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    playerId: '00000000-0000-4000-8000-000000000002',
    runUuid: 'run-fixture',
    seed: '42',
    username: 'Player雪',
    displayName: 'Étoile',
    won: true,
    verificationStatus: 'verified',
    runLevel: 2,
    wavesCompleted: 8,
    biomesVisited: ['top_lane', 'jungle'],
    goldEarned: 100,
    totalKills: 3,
    totalDamageDealt: '9007199254740993',
    candiesEarned: 20,
    totalGoldSpent: 50,
    totalHealingDone: '0',
    totalHealingReceived: '0',
    totalDamageReceived: '30',
    nodesCompleted: 9,
    combatsWon: 8,
    combatsLost: 0,
    eliteKills: 1,
    bossKills: 1,
    championsRecruited: 0,
    itemsPurchased: 1,
    startedAt: '2026-10-17T09:00:00.000Z',
    completedAt: '2026-10-17T09:30:00.000Z',
    durationSeconds: 1800,
    progressionSource: 'verified',
    engineVersion: 'run-engine-0.2.5',
    gameplayVersion: 24,
    progressionVersion: 3,
    ledgerVersion: 2,
    mode: 'normal',
    difficulty: 'normal',
    runeIds: ['precision'],
    augmentIds: ['augment-1'],
    team: [
      {
        championId: 'Garen',
        finalLevel: 3,
        finalHp: 150,
        survived: true,
        kills: 3,
        damageDealt: '9007199254740993',
        itemsCollected: ['item-fixture'],
        damageReceived: '30',
        healingDone: '0',
        healingReceived: '0',
        timeAliveSeconds: 15,
        crowdControlDuration: 0,
        goldEarned: 50,
        csScore: 3,
        wavesParticipated: 8,
        biomesParticipated: ['top_lane', 'jungle'],
      },
    ],
    ...overrides,
  };
}

export function adminAttemptFixture(overrides: Partial<AdminAttemptItem> = {}): AdminAttemptItem {
  return {
    id: '00000000-0000-4000-8000-000000000003',
    playerId: '00000000-0000-4000-8000-000000000002',
    username: 'Player雪',
    displayName: 'Étoile',
    status: 'rejected',
    mode: 'normal',
    difficulty: 'hard',
    engineVersion: 'run-engine-0.2.5',
    gameplayVersion: 24,
    progressionVersion: 3,
    commandSchemaVersion: 1,
    economyVersion: 1,
    startedAt: '2026-10-17T09:00:00.000Z',
    finishedAt: '2026-10-17T09:30:00.000Z',
    verifiedAt: null,
    rejectedAt: '2026-10-17T09:31:00.000Z',
    expiredAt: null,
    rejectionCode: 'pending_choice',
    resultRunId: null,
    lastSequence: 3,
    initialTeam: ['Garen'],
    ...overrides,
  };
}

export function adminRunPageFixture(items = [adminRunFixture()]) {
  return {
    items,
    total: items.length,
    hasMore: false,
    nextCursor: null,
    snapshotAt: runSnapshot,
  };
}

export function adminRunDetailFixture() {
  return {
    ...adminRunPageFixture([]),
    run: adminRunFixture(),
    attempt: adminAttemptFixture({ status: 'verified', rejectionCode: null }),
    timeline: [{ kind: 'verified' as const, at: runSnapshot, code: null }],
    items: [
      {
        sequence: 1,
        kind: 'choose_starter',
        receivedAt: runSnapshot,
        nodeId: null,
        championId: 'Garen',
        itemId: null,
        instanceId: null,
        augmentId: null,
        slot: null,
        combatMode: null,
      },
    ],
    total: 1,
  };
}
