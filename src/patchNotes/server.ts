import { supabase } from '@/services/supabaseClient';
import type { PatchNotesReadState } from './storage';

function parseServerState(row: {
  last_seen_sequence: number;
  last_seen_version: string;
}): PatchNotesReadState {
  if (
    !Number.isSafeInteger(row.last_seen_sequence) ||
    row.last_seen_sequence < 0 ||
    typeof row.last_seen_version !== 'string' ||
    row.last_seen_version.length === 0 ||
    row.last_seen_version.length > 100
  ) {
    throw new Error('invalid_patch_note_read_state');
  }
  return {
    version: 1,
    lastSeenSequence: row.last_seen_sequence,
    lastSeenVersion: row.last_seen_version,
    pendingSync: false,
  };
}
async function boundedRequest<T>(request: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 2_500);
  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(deadline);
  }
}
export async function loadServerPatchNotesState(
  userId: string,
): Promise<PatchNotesReadState | null> {
  const { data, error } = await boundedRequest((signal) =>
    supabase
      .from('player_patch_note_state')
      .select('last_seen_sequence, last_seen_version')
      .eq('user_id', userId)
      .abortSignal(signal)
      .maybeSingle(),
  );
  if (error) throw error;
  return data ? parseServerState(data) : null;
}
export async function saveServerPatchNotesState(
  userId: string,
  record: PatchNotesReadState,
): Promise<PatchNotesReadState> {
  const { data, error } = await boundedRequest((signal) =>
    supabase
      .rpc('mark_patch_notes_seen', {
        p_user_id: userId,
        p_sequence: record.lastSeenSequence,
        p_version: record.lastSeenVersion,
      })
      .abortSignal(signal),
  );
  if (error || !data) throw error ?? new Error('patch_notes_identity_changed');
  return parseServerState(data);
}
