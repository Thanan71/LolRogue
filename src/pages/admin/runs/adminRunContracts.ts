import type { AdminExplorerPage } from '../explorer/adminExplorerTypes';

export interface AdminRunTeamMember {
  championId: string;
  finalLevel: number;
  finalHp: number;
  survived: boolean;
  kills: number;
  damageDealt: string;
  itemsCollected: string[];
  damageReceived: string;
  healingDone: string;
  healingReceived: string;
  timeAliveSeconds: number;
  crowdControlDuration: number;
  goldEarned: number;
  csScore: number;
  wavesParticipated: number | null;
  biomesParticipated: string[] | null;
}

export interface AdminRunItem {
  id: string;
  playerId: string;
  runUuid: string;
  seed: string | null;
  username: string;
  displayName: string | null;
  won: boolean;
  verificationStatus: 'verified' | 'legacy';
  runLevel: number;
  wavesCompleted: number;
  biomesVisited: string[];
  goldEarned: number;
  totalKills: number;
  totalDamageDealt: string;
  candiesEarned: number;
  totalGoldSpent: number;
  totalHealingDone: string;
  totalHealingReceived: string;
  totalDamageReceived: string;
  nodesCompleted: number;
  combatsWon: number;
  combatsLost: number;
  eliteKills: number;
  bossKills: number;
  championsRecruited: number;
  itemsPurchased: number;
  startedAt: string;
  completedAt: string;
  durationSeconds: number | null;
  progressionSource: string;
  engineVersion: string | null;
  gameplayVersion: number | null;
  progressionVersion: number;
  ledgerVersion: number;
  mode: string | null;
  difficulty: string | null;
  runeIds: string[];
  augmentIds: string[];
  team: AdminRunTeamMember[];
}

export interface AdminAttemptItem {
  id: string;
  playerId: string;
  username: string;
  displayName: string | null;
  status: 'started' | 'finished' | 'verified' | 'rejected' | 'expired';
  mode: string;
  difficulty: string;
  engineVersion: string;
  gameplayVersion: number;
  progressionVersion: number;
  commandSchemaVersion: number;
  economyVersion: number | null;
  startedAt: string;
  finishedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  expiredAt: string | null;
  rejectionCode: string | null;
  resultRunId: string | null;
  lastSequence: number;
  initialTeam: string[];
}

export interface AdminRunAction {
  sequence: number;
  kind: string;
  receivedAt: string;
  nodeId: string | null;
  championId: string | null;
  itemId: string | null;
  instanceId: string | null;
  augmentId: string | null;
  slot: string | null;
  combatMode: 'auto' | 'manual' | null;
}

export interface AdminRunTimelineEvent {
  kind: 'started' | 'finished' | 'verified' | 'rejected' | 'expired' | 'completed';
  at: string;
  code: string | null;
}

export interface AdminRunDetail extends AdminExplorerPage<AdminRunAction> {
  run: AdminRunItem | null;
  attempt: AdminAttemptItem | null;
  timeline: AdminRunTimelineEvent[];
}

export function runRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid admin run projection.');
  return value as Record<string, unknown>;
}

export function runText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid admin run text.');
  return value;
}

export function runNullableText(value: unknown): string | null {
  return value === null ? null : runText(value);
}

export function runCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid admin run count.');
  return value;
}

function nullableCount(value: unknown): number | null {
  return value === null ? null : runCount(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid admin run flag.');
  return value;
}

function decimal(value: unknown): string {
  const text = runText(value);
  if (!/^\d+$/.test(text)) throw new Error('Invalid admin run decimal.');
  return text;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid admin run list.');
  return value.map(runText);
}

export function parseAdminRunTeamMember(value: unknown): AdminRunTeamMember {
  const row = runRecord(value);
  return {
    championId: runText(row.championId),
    finalLevel: runCount(row.finalLevel),
    finalHp: runCount(row.finalHp),
    survived: boolean(row.survived),
    kills: runCount(row.kills),
    damageDealt: decimal(row.damageDealt),
    itemsCollected: strings(row.itemsCollected),
    damageReceived: decimal(row.damageReceived),
    healingDone: decimal(row.healingDone),
    healingReceived: decimal(row.healingReceived),
    timeAliveSeconds: runCount(row.timeAliveSeconds),
    crowdControlDuration: runCount(row.crowdControlDuration),
    goldEarned: runCount(row.goldEarned),
    csScore: runCount(row.csScore),
    wavesParticipated: nullableCount(row.wavesParticipated),
    biomesParticipated: row.biomesParticipated === null ? null : strings(row.biomesParticipated),
  };
}

/** Pick only the public admin projection; never forward arbitrary server fields to the UI. */
export function parseAdminRunItem(value: unknown): AdminRunItem {
  const row = runRecord(value);
  if (!Array.isArray(row.team) || row.team.length > 5) throw new Error('Invalid admin run team.');
  if (row.verificationStatus !== 'verified' && row.verificationStatus !== 'legacy')
    throw new Error('Invalid admin run verification.');
  return {
    id: runText(row.id),
    playerId: runText(row.playerId),
    runUuid: runText(row.runUuid),
    seed:
      row.seed === null
        ? null
        : (() => {
            const value = runText(row.seed);
            if (!/^-?\d+$/.test(value)) throw new Error('Invalid run seed.');
            return value;
          })(),
    username: runText(row.username),
    displayName: runNullableText(row.displayName),
    won: boolean(row.won),
    verificationStatus: row.verificationStatus,
    runLevel: runCount(row.runLevel),
    wavesCompleted: runCount(row.wavesCompleted),
    biomesVisited: strings(row.biomesVisited),
    goldEarned: runCount(row.goldEarned),
    totalKills: runCount(row.totalKills),
    totalDamageDealt: decimal(row.totalDamageDealt),
    candiesEarned: runCount(row.candiesEarned),
    totalGoldSpent: runCount(row.totalGoldSpent),
    totalHealingDone: decimal(row.totalHealingDone),
    totalHealingReceived: decimal(row.totalHealingReceived),
    totalDamageReceived: decimal(row.totalDamageReceived),
    nodesCompleted: runCount(row.nodesCompleted),
    combatsWon: runCount(row.combatsWon),
    combatsLost: runCount(row.combatsLost),
    eliteKills: runCount(row.eliteKills),
    bossKills: runCount(row.bossKills),
    championsRecruited: runCount(row.championsRecruited),
    itemsPurchased: runCount(row.itemsPurchased),
    startedAt: runText(row.startedAt),
    completedAt: runText(row.completedAt),
    durationSeconds: nullableCount(row.durationSeconds),
    progressionSource: runText(row.progressionSource),
    engineVersion: runNullableText(row.engineVersion),
    gameplayVersion: nullableCount(row.gameplayVersion),
    progressionVersion: runCount(row.progressionVersion),
    ledgerVersion: runCount(row.ledgerVersion),
    mode: runNullableText(row.mode),
    difficulty: runNullableText(row.difficulty),
    runeIds: strings(row.runeIds),
    augmentIds: strings(row.augmentIds),
    team: row.team.map(parseAdminRunTeamMember),
  };
}

export function parseAdminAttemptItem(value: unknown): AdminAttemptItem {
  const row = runRecord(value);
  const status = runText(row.status);
  if (!['started', 'finished', 'verified', 'rejected', 'expired'].includes(status))
    throw new Error('Invalid admin attempt status.');
  return {
    id: runText(row.id),
    playerId: runText(row.playerId),
    username: runText(row.username),
    displayName: runNullableText(row.displayName),
    status: status as AdminAttemptItem['status'],
    mode: runText(row.mode),
    difficulty: runText(row.difficulty),
    engineVersion: runText(row.engineVersion),
    gameplayVersion: runCount(row.gameplayVersion),
    progressionVersion: runCount(row.progressionVersion),
    commandSchemaVersion: runCount(row.commandSchemaVersion),
    economyVersion: nullableCount(row.economyVersion),
    startedAt: runText(row.startedAt),
    finishedAt: runNullableText(row.finishedAt),
    verifiedAt: runNullableText(row.verifiedAt),
    rejectedAt: runNullableText(row.rejectedAt),
    expiredAt: runNullableText(row.expiredAt),
    rejectionCode: runNullableText(row.rejectionCode),
    resultRunId: runNullableText(row.resultRunId),
    lastSequence: runCount(row.lastSequence),
    initialTeam: strings(row.initialTeam),
  };
}

export function parseAdminRunAction(value: unknown): AdminRunAction {
  const row = runRecord(value);
  const combatMode = runNullableText(row.combatMode);
  if (combatMode !== null && combatMode !== 'auto' && combatMode !== 'manual')
    throw new Error('Invalid admin action mode.');
  return {
    sequence: runCount(row.sequence),
    kind: runText(row.kind),
    receivedAt: runText(row.receivedAt),
    nodeId: runNullableText(row.nodeId),
    championId: runNullableText(row.championId),
    itemId: runNullableText(row.itemId),
    instanceId: runNullableText(row.instanceId),
    augmentId: runNullableText(row.augmentId),
    slot: runNullableText(row.slot),
    combatMode,
  };
}

export function parseAdminRunTimeline(value: unknown): AdminRunTimelineEvent[] {
  if (!Array.isArray(value) || value.length > 6) throw new Error('Invalid admin run timeline.');
  return value.map((value) => {
    const event = runRecord(value);
    const kind = runText(event.kind);
    if (!['started', 'finished', 'verified', 'rejected', 'expired', 'completed'].includes(kind))
      throw new Error('Invalid admin milestone.');
    return {
      kind: kind as AdminRunTimelineEvent['kind'],
      at: runText(event.at),
      code: runNullableText(event.code),
    };
  });
}
