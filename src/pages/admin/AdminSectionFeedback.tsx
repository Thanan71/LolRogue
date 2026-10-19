import { fr } from '@/i18n/fr';
import { formatAdminNumber } from '../adminPageUtils';
import { formatAdminMetric } from './adminMetrics';
import type { AdminSectionFeedback as Feedback } from './useAdminSection';

export function AdminSectionFeedback({ state }: { state: Feedback }) {
  if (!state.stale) return null;
  return (
    <p role="status" className="admin-data-status">
      {state.loading ? fr.admin.refreshingData : fr.admin.staleData}
      {state.updatedAt !== null && (
        <>
          {' '}
          {fr.admin.lastUpdated} :{' '}
          {formatAdminMetric(state.updatedAt, 'timestamp', fr.admin.unavailable)}
        </>
      )}
    </p>
  );
}

export function AdminTableCount({ displayed, total }: { displayed: number; total: number | null }) {
  return (
    <p className="summary-text" role="status">
      {fr.admin.displayedRows} :{' '}
      {total === null ? fr.admin.unavailable : formatAdminNumber(displayed)}
      {' · '}
      {fr.admin.matchingTotal} : {total === null ? fr.admin.unavailable : formatAdminNumber(total)}
    </p>
  );
}
