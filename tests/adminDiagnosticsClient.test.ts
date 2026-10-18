import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminDiagnostics } from '@/pages/admin/diagnostics/adminDiagnosticsClient';
import {
  diagnosticsRequest,
  diagnosticsResponse,
  DIAGNOSTICS_TEST_SNAPSHOT,
  DIAGNOSTICS_TEST_UUID,
} from './helpers/adminDiagnosticsUiFixtures';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
function response(data: unknown, error: unknown = null) {
  return {
    abortSignal: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data, error }).then(resolve),
  };
}
beforeEach(() => mocks.rpc.mockReset());
describe('read-only guarded diagnostics RPC client', () => {
  it.each(['logs', 'authority', 'service', 'correlation'] as const)(
    'uses one filtered %s RPC and preserves cancellation',
    async (section) => {
      const request = diagnosticsRequest(section);
      const value = diagnosticsResponse(request);
      const query = response(value);
      const controller = new AbortController();
      mocks.rpc.mockReturnValueOnce(query);
      expect(await fetchAdminDiagnostics(request, controller.signal)).toEqual(value);
      expect(mocks.rpc).toHaveBeenCalledWith('admin_diagnostics', {
        p_section: section,
        p_filters: request.filters,
        p_limit: 25,
        p_cursor: null,
        p_snapshot: undefined,
      });
      expect(query.abortSignal).toHaveBeenCalledWith(controller.signal);
    },
  );
  it('preserves exact microsecond cursor, filters and snapshot on a later server page', async () => {
    const request = {
      ...diagnosticsRequest('logs', { level: 'error', correlationId: DIAGNOSTICS_TEST_UUID }),
      cursor: { at: '2026-10-18T12:00:00.000001Z', id: DIAGNOSTICS_TEST_UUID },
      snapshotAt: DIAGNOSTICS_TEST_SNAPSHOT,
      limit: 50,
    };
    mocks.rpc.mockReturnValueOnce(response(diagnosticsResponse(request)));
    await fetchAdminDiagnostics(request);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_diagnostics', {
      p_section: 'logs',
      p_filters: request.filters,
      p_limit: 50,
      p_cursor: request.cursor,
      p_snapshot: DIAGNOSTICS_TEST_SNAPSHOT,
    });
  });
  it.each(['42501', '57014', 'PGRST302'])(
    'propagates structured %s without replacing failure with an empty success',
    async (code) => {
      const error = { code, message: 'Private server detail never rendered' };
      mocks.rpc.mockReturnValueOnce(response(null, error));
      await expect(fetchAdminDiagnostics(diagnosticsRequest('logs'))).rejects.toBe(error);
    },
  );
  it('rejects invalid requests before sending and inconsistent responses before rendering', async () => {
    await expect(
      fetchAdminDiagnostics(diagnosticsRequest('correlation', { attemptId: 'not-a-uuid' })),
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
    const request = diagnosticsRequest('logs');
    mocks.rpc.mockReturnValueOnce(
      response({
        ...diagnosticsResponse(request),
        filters: { ...request.filters, level: 'error' },
      }),
    );
    await expect(fetchAdminDiagnostics(request)).rejects.toThrow(
      'Invalid admin diagnostics contract.',
    );
  });
  it('preserves network rejection and an aborted request instead of synthesizing a status', async () => {
    const network = new TypeError('Failed to fetch');
    mocks.rpc.mockReturnValueOnce(Promise.reject(network));
    await expect(fetchAdminDiagnostics(diagnosticsRequest('service'))).rejects.toBe(network);
    const abort = new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    controller.abort();
    mocks.rpc.mockReturnValueOnce({ abortSignal: vi.fn().mockRejectedValue(abort) });
    await expect(
      fetchAdminDiagnostics(diagnosticsRequest('authority'), controller.signal),
    ).rejects.toBe(abort);
  });
});
