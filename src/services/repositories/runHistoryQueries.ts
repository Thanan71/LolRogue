/** Profile-only reads, loaded when their repository methods are called. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type {
  RunHistoryCursor,
  RunHistoryEntry,
  RunHistoryQuery,
  RunRejectionCursor,
  RunRejectionEntry,
} from '../interfaces/IRunRepository';

// Preserve Postgres microsecond precision and reject PostgREST filter syntax.
function isHistoryCursor(timestamp: string, id: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) &&
    Number.isFinite(Date.parse(timestamp)) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

// Keep both projections literal so Supabase infers them from the generated
// schema. An unchecked string replacement would hide relationship/column drift.
const RUN_HISTORY_SUMMARY_SELECT =
  'id, player_id, won, run_level, waves_completed, total_kills, completed_at, created_at, progression_source, run_attempt_id';
const RUN_HISTORY_SELECT =
  `${RUN_HISTORY_SUMMARY_SELECT}, run_attempts!runs_run_attempt_id_fkey(difficulty, mode, engine_version, gameplay_ruleset_version, ruleset_version)` as const;
const RUN_HISTORY_FILTERED_SELECT =
  `${RUN_HISTORY_SUMMARY_SELECT}, run_attempts!runs_run_attempt_id_fkey!inner(difficulty, mode, engine_version, gameplay_ruleset_version, ruleset_version)` as const;

export async function getPlayerRunHistory(
  supabase: SupabaseClient<Database>,
  playerId: string,
  limit: number,
  options: RunHistoryQuery,
): Promise<{
  data: RunHistoryEntry[] | null;
  nextCursor: RunHistoryCursor | null;
  error: Error | null;
}> {
  const { filters = {}, cursor } = options;
  if (cursor && !isHistoryCursor(cursor.createdAt, cursor.id)) {
    return { data: null, nextCursor: null, error: new Error('invalid_history_cursor') };
  }
  const pageSize = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));
  const attemptFilters = [
    ['difficulty', filters.difficulty],
    ['mode', filters.mode],
    ['engine_version', filters.engineVersion?.trim() || undefined],
    ['gameplay_ruleset_version', filters.gameplayRulesetVersion],
    ['ruleset_version', filters.progressionRulesetVersion],
  ] as const;
  const select = attemptFilters.some(([, value]) => value !== undefined)
    ? RUN_HISTORY_FILTERED_SELECT
    : RUN_HISTORY_SELECT;
  let query = supabase.from('runs').select(select).eq('player_id', playerId);
  if (filters.outcome) query = query.eq('won', filters.outcome === 'victory');
  for (const [column, value] of attemptFilters) {
    if (value !== undefined) query = query.eq(`run_attempts.${column}`, value);
  }
  if (cursor)
    query = query
      .lte('created_at', cursor.createdAt)
      .or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, pageSize);

  if (error) return { data: null, nextCursor: null, error };

  const entries = (data ?? []).map((raw) => {
    const { run_attempts, ...run } = raw;
    return {
      run,
      attempt: run_attempts
        ? {
            difficulty: run_attempts.difficulty,
            mode: run_attempts.mode,
            engineVersion: run_attempts.engine_version,
            gameplayRulesetVersion: run_attempts.gameplay_ruleset_version,
            progressionRulesetVersion: run_attempts.ruleset_version,
          }
        : null,
    } satisfies RunHistoryEntry;
  });
  const page = entries.slice(0, pageSize);
  const last = page[page.length - 1];
  return {
    data: page,
    error: null,
    nextCursor:
      entries.length > pageSize && last
        ? { createdAt: last.run.created_at, id: last.run.id }
        : null,
  };
}

export async function getPlayerRunRejections(
  supabase: SupabaseClient<Database>,
  playerId: string,
  limit: number,
  cursor?: RunRejectionCursor,
): Promise<{
  data: RunRejectionEntry[] | null;
  nextCursor: RunRejectionCursor | null;
  error: Error | null;
}> {
  if (cursor && !isHistoryCursor(cursor.startedAt, cursor.id))
    return { data: null, nextCursor: null, error: new Error('invalid_history_cursor') };
  const pageSize = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));
  const { data, error } = await supabase.rpc('get_player_run_rejections', {
    p_player_id: playerId,
    p_limit: pageSize + 1,
    ...(cursor ? { p_before_started_at: cursor.startedAt, p_before_id: cursor.id } : {}),
  });
  if (error) return { data: null, nextCursor: null, error };
  const entries = (data ?? []).slice(0, pageSize).map((entry) => ({
    attemptId: entry.attempt_id,
    startedAt: entry.started_at,
    rejectedAt: entry.rejected_at,
    difficulty: entry.difficulty,
    mode: entry.mode,
    engineVersion: entry.engine_version,
    gameplayRulesetVersion: entry.gameplay_ruleset_version,
    progressionRulesetVersion: entry.progression_ruleset_version,
    rejectionCode: entry.rejection_code,
  }));
  const last = entries[entries.length - 1];
  return {
    data: entries,
    error: null,
    nextCursor:
      data && data.length > pageSize && last
        ? { startedAt: last.startedAt, id: last.attemptId }
        : null,
  };
}
