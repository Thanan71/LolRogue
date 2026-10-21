import { supabase } from '@/services/supabaseClient';
import type {
  ModerationDecisionRequest,
  ModerationHistoryRequest,
  ModerationQueueRequest,
} from '../../domain/moderation/moderationTypes';
import {
  parseModerationHistory,
  parseModerationQueue,
  parseModerationReceipt,
  validateModerationDecision,
  validateModerationFilters,
} from '../../domain/moderation/moderationValidation';

export async function fetchModerationQueue(request: ModerationQueueRequest, signal?: AbortSignal) {
  const filters = validateModerationFilters({
    status: request.status,
    from: request.from,
    to: request.to,
    dailyRunId: request.dailyRunId,
  });
  let query = supabase.rpc('admin_moderation_queue', {
    p_status: filters.status,
    p_from: filters.from ?? undefined,
    p_to: filters.to ?? undefined,
    p_daily_run_id: filters.dailyRunId ?? undefined,
    p_limit: request.limit ?? 25,
    p_cursor: request.cursor ? { ...request.cursor } : null,
    p_snapshot: request.snapshotAt ?? undefined,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return parseModerationQueue(data, { ...request, limit: request.limit ?? 25 });
}

export async function fetchModerationHistory(
  request: ModerationHistoryRequest,
  signal?: AbortSignal,
) {
  let query = supabase.rpc('admin_moderation_history', {
    p_daily_run_id: request.dailyRunId,
    p_limit: request.limit ?? 25,
    p_cursor: request.cursor ? { ...request.cursor } : null,
    p_snapshot: request.snapshotAt ?? undefined,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return parseModerationHistory(data, {
    ...request,
    limit: request.limit ?? 25,
  });
}

export async function sendModerationDecision(
  request: ModerationDecisionRequest,
  signal: AbortSignal,
) {
  const normalized = validateModerationDecision(request);
  const { data, error } = await supabase
    .rpc('admin_moderation_decide', normalized)
    .abortSignal(signal);
  if (error) throw error;
  return parseModerationReceipt(data, normalized);
}
