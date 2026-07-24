import type { Json } from '@/types/database';
import type { RunSummary, ServerRunProgression } from '@/types/run';
import type {
  AppendRunCommandsResult,
  AuthorityDifficulty,
  AuthorityRunMode,
  RunAttemptCommand,
  RunAttemptStatus,
  RunAttemptStatusResult,
  RunEnhancementSnapshot,
  SealRunAttemptResult,
  StartRunAttemptInput,
  StartRunAttemptResult,
} from '@/types/runAttempt';
import { supabase } from './supabaseClient';

type JsonRecord = Record<string, Json | undefined>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTEMPT_STATUSES: readonly RunAttemptStatus[] = [
  'started',
  'active',
  'finished',
  'verifying',
  'verified',
  'rejected',
  'expired',
];
const DIFFICULTIES: readonly AuthorityDifficulty[] = ['easy', 'normal', 'hard'];
const MODES: readonly AuthorityRunMode[] = ['normal', 'daily'];
const STARTER_RUNE_IDS = new Set([
  'press_the_attack',
  'electrocute',
  'summon_aery',
  'grasp_of_the_undying',
  'glacial_augment',
]);

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isRunUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 160;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0)
  );
}

function isStatus(value: unknown): value is RunAttemptStatus {
  return typeof value === 'string' && ATTEMPT_STATUSES.includes(value as RunAttemptStatus);
}

function isDifficulty(value: unknown): value is AuthorityDifficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value as AuthorityDifficulty);
}

function isMode(value: unknown): value is AuthorityRunMode {
  return typeof value === 'string' && MODES.includes(value as AuthorityRunMode);
}

function isStarterTeam(value: unknown): value is [string] {
  return isStringArray(value) && value.length === 1;
}

function isStarterRuneIds(value: unknown): value is string[] {
  return (
    isStringArray(value) &&
    value.length <= 3 &&
    new Set(value).size === value.length &&
    value.every((runeId) => STARTER_RUNE_IDS.has(runeId))
  );
}

function normalizeRpcError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const rpcError = error as Record<string, unknown>;
    const message = typeof rpcError.message === 'string' ? rpcError.message : '';
    const details = typeof rpcError.details === 'string' ? rpcError.details : '';
    const hint = typeof rpcError.hint === 'string' ? rpcError.hint : '';
    const code = typeof rpcError.code === 'string' ? rpcError.code : '';
    const status = rpcError.status != null ? `status=${rpcError.status}` : '';
    const parts = [message, details, hint, code, status].filter(Boolean);
    return new Error(parts.join(' | ') || JSON.stringify(rpcError));
  }
  return new Error(String(error));
}

function parseEnhancementSnapshot(value: unknown): RunEnhancementSnapshot | null {
  const champions = asRecord(value);
  if (!champions) return null;

  const snapshot: RunEnhancementSnapshot = {};
  for (const [championId, rawNodes] of Object.entries(champions)) {
    const nodes = asRecord(rawNodes);
    if (!championId || !nodes) return null;
    snapshot[championId] = {};
    for (const [nodeId, rank] of Object.entries(nodes)) {
      if (!nodeId || !isInteger(rank) || rank < 0) return null;
      snapshot[championId][nodeId] = rank;
    }
  }
  return snapshot;
}

function parseStartResult(value: unknown): StartRunAttemptResult | null {
  const result = asRecord(value);
  if (!result) return null;
  const enhancementSnapshot = parseEnhancementSnapshot(result.enhancement_snapshot);
  if (
    !isUuid(result.attempt_id) ||
    !isRunUuid(result.run_uuid) ||
    result.status !== 'started' ||
    !isInteger(result.ruleset_version) ||
    typeof result.engine_version !== 'string' ||
    !result.engine_version ||
    !isInteger(result.seed) ||
    !isMode(result.mode) ||
    !isDifficulty(result.difficulty) ||
    !isStarterTeam(result.initial_team) ||
    !isStarterRuneIds(result.rune_ids) ||
    enhancementSnapshot === null ||
    !isIsoDate(result.started_at) ||
    !isIsoDate(result.expires_at) ||
    !isInteger(result.last_sequence) ||
    typeof result.journal_hash !== 'string' ||
    typeof result.replayed !== 'boolean'
  ) {
    return null;
  }

  return {
    attemptId: result.attempt_id,
    runUuid: result.run_uuid,
    status: result.status,
    rulesetVersion: result.ruleset_version,
    engineVersion: result.engine_version,
    seed: result.seed,
    mode: result.mode,
    difficulty: result.difficulty,
    initialTeam: result.initial_team,
    runeIds: result.rune_ids,
    enhancementSnapshot,
    startedAt: result.started_at,
    expiresAt: result.expires_at,
    lastSequence: result.last_sequence,
    journalHash: result.journal_hash,
    replayed: result.replayed,
  };
}

function parseAppendResult(value: unknown): AppendRunCommandsResult | null {
  const result = asRecord(value);
  if (
    !result ||
    !isUuid(result.attempt_id) ||
    !isStatus(result.status) ||
    !isInteger(result.last_sequence) ||
    typeof result.journal_hash !== 'string' ||
    !isInteger(result.accepted) ||
    typeof result.replayed !== 'boolean'
  ) {
    return null;
  }
  return {
    attemptId: result.attempt_id,
    status: result.status,
    lastSequence: result.last_sequence,
    journalHash: result.journal_hash,
    accepted: result.accepted,
    replayed: result.replayed,
  };
}

function parseSealResult(value: unknown): SealRunAttemptResult | null {
  const result = asRecord(value);
  if (
    !result ||
    !isUuid(result.attempt_id) ||
    !isRunUuid(result.run_uuid) ||
    (result.status !== 'finished' &&
      result.status !== 'expired' &&
      result.status !== 'verified' &&
      result.status !== 'rejected') ||
    !isInteger(result.last_sequence) ||
    typeof result.journal_hash !== 'string' ||
    typeof result.accepted !== 'boolean' ||
    typeof result.replayed !== 'boolean'
  ) {
    return null;
  }
  return {
    attemptId: result.attempt_id,
    runUuid: result.run_uuid,
    status: result.status,
    lastSequence: result.last_sequence,
    journalHash: result.journal_hash,
    accepted: result.accepted,
    replayed: result.replayed,
  };
}

function parseStatusResult(value: unknown): RunAttemptStatusResult | null {
  const result = asRecord(value);
  if (
    !result ||
    !isUuid(result.attempt_id) ||
    !isRunUuid(result.run_uuid) ||
    !isStatus(result.status) ||
    !isInteger(result.ruleset_version) ||
    typeof result.engine_version !== 'string' ||
    !isInteger(result.seed) ||
    !isMode(result.mode) ||
    !isDifficulty(result.difficulty) ||
    !isStarterTeam(result.initial_team) ||
    !isStarterRuneIds(result.rune_ids) ||
    !isIsoDate(result.started_at) ||
    !isIsoDate(result.expires_at) ||
    !isInteger(result.last_sequence) ||
    typeof result.journal_hash !== 'string' ||
    (result.rejection_code !== null && typeof result.rejection_code !== 'string')
  ) {
    return null;
  }
  return {
    attemptId: result.attempt_id,
    runUuid: result.run_uuid,
    status: result.status,
    rulesetVersion: result.ruleset_version,
    engineVersion: result.engine_version,
    seed: result.seed,
    mode: result.mode,
    difficulty: result.difficulty,
    initialTeam: result.initial_team,
    runeIds: result.rune_ids,
    startedAt: result.started_at,
    expiresAt: result.expires_at,
    lastSequence: result.last_sequence,
    journalHash: result.journal_hash,
    response: result.response,
    rejectionCode: result.rejection_code,
  };
}

async function callAttemptRpc(
  name:
    | 'start_run_attempt'
    | 'append_run_attempt_commands'
    | 'seal_run_attempt'
    | 'get_run_attempt_status'
    | 'expire_stale_run_attempts',
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc(name as never, args as never);
    return { data, error: error ? normalizeRpcError(error) : null };
  } catch (error) {
    return {
      data: null,
      error: normalizeRpcError(error),
    };
  }
}

export async function startRunAttempt(
  input: StartRunAttemptInput,
): Promise<{ data: StartRunAttemptResult | null; error: Error | null }> {
  const expiry = await callAttemptRpc('expire_stale_run_attempts', {});
  if (expiry.error) return { data: null, error: expiry.error };

  const result = await callAttemptRpc('start_run_attempt', {
    p_command_id: input.commandId,
    p_team: input.team,
    p_rune_ids: input.runeIds,
    p_difficulty: input.difficulty,
    p_mode: input.mode,
  });
  if (result.error) return { data: null, error: result.error };
  const parsed = parseStartResult(result.data);
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Invalid start_run_attempt response') };
}

export async function appendRunAttemptCommands(
  attemptId: string,
  commands: RunAttemptCommand[],
): Promise<{ data: AppendRunCommandsResult | null; error: Error | null }> {
  const result = await callAttemptRpc('append_run_attempt_commands', {
    p_attempt_id: attemptId,
    p_commands: commands.map(({ commandId, sequence, kind, payload }) => ({
      command_id: commandId,
      sequence,
      kind,
      payload,
    })),
  });
  if (result.error) return { data: null, error: result.error };
  const parsed = parseAppendResult(result.data);
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Invalid append_run_attempt_commands response') };
}

export async function sealRunAttempt(
  attemptId: string,
  finishCommandId: string,
  expectedSequence: number,
): Promise<{ data: SealRunAttemptResult | null; error: Error | null }> {
  const result = await callAttemptRpc('seal_run_attempt', {
    p_attempt_id: attemptId,
    p_finish_command_id: finishCommandId,
    p_expected_sequence: expectedSequence,
  });
  if (result.error) return { data: null, error: result.error };
  const parsed = parseSealResult(result.data);
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Invalid seal_run_attempt response') };
}

export async function getRunAttemptStatus(
  attemptId: string,
): Promise<{ data: RunAttemptStatusResult | null; error: Error | null }> {
  const result = await callAttemptRpc('get_run_attempt_status', { p_attempt_id: attemptId });
  if (result.error) return { data: null, error: result.error };
  const parsed = parseStatusResult(result.data);
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Invalid get_run_attempt_status response') };
}

export interface VerifyRunAttemptResult {
  progression: ServerRunProgression;
  summary: RunSummary | null;
}

export class RunVerificationRejectedError extends Error {
  readonly terminal = true;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RunVerificationRejectedError';
  }
}

function parseVerificationRejection(value: unknown): RunVerificationRejectedError | null {
  const envelope = asRecord(value);
  if (!envelope) return null;
  const error = asRecord(envelope.error);
  const scalarError = typeof envelope.error === 'string' ? envelope.error : null;
  const code =
    typeof error?.code === 'string'
      ? error.code
      : typeof envelope.rejection_code === 'string'
        ? envelope.rejection_code
        : envelope.status === 'rejected'
          ? 'trace_rejected'
          : scalarError === 'run_verification_rejected' || scalarError === 'run_attempt_expired'
            ? scalarError
            : null;
  if (!code && envelope.ok !== false) return null;
  return new RunVerificationRejectedError(
    code ?? 'trace_rejected',
    typeof error?.message === 'string'
      ? error.message
      : code === 'run_attempt_expired'
        ? 'This verified run attempt has expired.'
        : 'The run trace was rejected.',
  );
}

async function parseFunctionTerminalError(
  error: unknown,
): Promise<RunVerificationRejectedError | null> {
  if (!error || typeof error !== 'object') return null;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return null;
  const response = context as {
    status?: number;
    clone?: () => { json?: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  };
  if (typeof response.status === 'number' && response.status >= 500) return null;

  try {
    const clone = typeof response.clone === 'function' ? response.clone() : response;
    const body = typeof clone.json === 'function' ? await clone.json() : null;
    return parseVerificationRejection(body);
  } catch {
    return null;
  }
}

function parseRunSummary(value: unknown): RunSummary | null {
  const summary = asRecord(value);
  if (!summary) return null;
  const championStats = summary.champion_stats;
  if (
    typeof summary.won !== 'boolean' ||
    !isInteger(summary.waves_completed) ||
    !isStringArray(summary.biomes_visited) ||
    !isInteger(summary.total_kills) ||
    !isInteger(summary.total_damage) ||
    !isInteger(summary.gold_earned) ||
    !isInteger(summary.run_level) ||
    !Array.isArray(championStats)
  ) {
    return null;
  }
  const parsedChampionStats = championStats.map((entry) => {
    const stats = asRecord(entry);
    return stats &&
      typeof stats.champion_id === 'string' &&
      isInteger(stats.kills) &&
      isInteger(stats.total_damage) &&
      typeof stats.survived === 'boolean'
      ? {
          championId: stats.champion_id,
          kills: stats.kills,
          totalDamage: stats.total_damage,
          survived: stats.survived,
        }
      : null;
  });
  if (parsedChampionStats.some((entry) => entry === null)) return null;
  return {
    won: summary.won,
    wavesCompleted: summary.waves_completed,
    biomesVisited: summary.biomes_visited as RunSummary['biomesVisited'],
    totalKills: summary.total_kills,
    totalDamage: summary.total_damage,
    goldEarned: summary.gold_earned,
    runLevel: summary.run_level,
    championStats: parsedChampionStats as RunSummary['championStats'],
  };
}

function parseVerifiedResponse(value: unknown): VerifyRunAttemptResult | null {
  const envelope = asRecord(value);
  if (!envelope) return null;
  const response = asRecord(envelope.response) ?? envelope;
  if (
    !isUuid(response.run_id) ||
    typeof response.replayed !== 'boolean' ||
    !isInteger(response.candies_earned) ||
    !isInteger(response.candies_per_champion) ||
    !isInteger(response.progression_version) ||
    response.progression_source !== 'verified'
  ) {
    return null;
  }
  return {
    progression: {
      runId: response.run_id,
      replayed: response.replayed,
      candiesEarned: response.candies_earned,
      candiesPerChampion: response.candies_per_champion,
      progressionVersion: response.progression_version,
      progressionSource: response.progression_source,
    },
    summary: response.summary === undefined ? null : parseRunSummary(response.summary),
  };
}

export async function recoverVerifiedRunAttempt(
  attemptId: string,
): Promise<{ data: VerifyRunAttemptResult | null; error: Error | null }> {
  const status = await getRunAttemptStatus(attemptId);
  if (status.error || !status.data) {
    return { data: null, error: status.error ?? new Error('Run attempt status is unavailable') };
  }
  if (status.data.status === 'rejected') {
    return {
      data: null,
      error: new RunVerificationRejectedError(
        status.data.rejectionCode ?? 'trace_rejected',
        'The run trace was rejected.',
      ),
    };
  }
  if (status.data.status !== 'verified') {
    return { data: null, error: new Error(`Run attempt is ${status.data.status}`) };
  }
  const parsed = parseVerifiedResponse({ response: status.data.response });
  return parsed
    ? { data: parsed, error: null }
    : { data: null, error: new Error('Invalid verified run response') };
}

export async function verifyRunAttempt(
  attemptId: string,
): Promise<{ data: VerifyRunAttemptResult | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-run', {
      body: { attempt_id: attemptId },
    });
    if (error) {
      const terminalError = await parseFunctionTerminalError(error);
      return { data: null, error: terminalError ?? error };
    }
    const rejection = parseVerificationRejection(data);
    if (rejection) return { data: null, error: rejection };
    const parsed = parseVerifiedResponse(data);
    return parsed
      ? { data: parsed, error: null }
      : { data: null, error: new Error('Invalid verify-run response') };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
