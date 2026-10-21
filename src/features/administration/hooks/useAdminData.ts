import type { AdminStats } from '../domain/adminDataContracts';
import { fetchAdminStats } from '../infrastructure/adminDashboardQueries';
import { useAdminExplorerScope } from './explorer/useAdminExplorerScope';
import { useAdminSection } from './useAdminSection';

const EMPTY_STATS: AdminStats = {};
const emptyStats = (data: AdminStats) => Object.keys(data).length === 0;

/** Dashboard data only. Diagnostics own their lazy, permission-scoped RPC reads. */
export function useAdminData(isAdmin: boolean, active = true) {
  const { enabled, scope, captureScope } = useAdminExplorerScope(isAdmin);
  const stats = useAdminSection({
    enabled: enabled && active,
    scope,
    captureScope,
    initialData: EMPTY_STATS,
    load: fetchAdminStats,
    isEmpty: emptyStats,
  });
  return {
    stats: stats.data,
    loading: stats.loading,
    statsLoading: stats.loading,
    sections: { stats },
    errors: { stats: stats.error },
    fetchStats: stats.reload,
  };
}
