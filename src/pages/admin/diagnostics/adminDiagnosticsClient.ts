import { supabase } from '@/services/supabaseClient';
import type {
  DiagnosticsRequest,
  DiagnosticsResponse,
  DiagnosticsSection,
} from './adminDiagnosticsTypes';
import { parseAdminDiagnostics } from './adminDiagnosticsParser';
import { validateDiagnosticsRequest } from './adminDiagnosticsValidation';

/** Read-only RPC; the database checks the current admin role on every call. */
export async function fetchAdminDiagnostics<S extends DiagnosticsSection>(
  request: DiagnosticsRequest<S>,
  signal?: AbortSignal,
): Promise<DiagnosticsResponse<S>> {
  const validated = validateDiagnosticsRequest(request);
  let query = supabase.rpc('admin_diagnostics', {
    p_section: validated.section,
    p_filters: { ...validated.filters },
    p_cursor: validated.cursor ? { ...validated.cursor } : null,
    p_snapshot: validated.snapshotAt ?? undefined,
    p_limit: validated.limit,
  });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return parseAdminDiagnostics(data, validated);
}
