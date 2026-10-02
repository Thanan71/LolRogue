import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { formatAdminDate, formatAdminDay, formatAdminNumber } from '../adminPageUtils';
import { AdminErrorNotice } from './AdminErrorNotice';
import type { AdminModerationReport } from './useAdminData';

export function AdminModerationPanel({
  reports,
  loading,
  error,
  onRetry,
  onInvalidate,
}: {
  reports: AdminModerationReport[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onInvalidate: (dailyRunId: string, reason: string) => Promise<boolean>;
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  const invalidate = async (report: AdminModerationReport) => {
    const reason = (reasons[report.id] ?? report.reason).trim();
    if (reason.length < 10 || reason.length > 500) return;
    if (!window.confirm(fr.admin.moderationConfirm)) return;
    setPendingId(report.id);
    try {
      await onInvalidate(report.dailyRunId, reason);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section
      className="moderation-tab"
      role="tabpanel"
      id="admin-panel-moderation"
      aria-labelledby="admin-tab-moderation"
    >
      <AdminErrorNotice message={error} onRetry={onRetry} retrying={loading} />
      <div className="runs-header">
        <div>
          <h3>{fr.admin.dailyReports}</h3>
          <p>{fr.admin.moderationSubtitle}</p>
        </div>
        <button onClick={onRetry} disabled={loading}>
          {fr.admin.refresh}
        </button>
      </div>

      {loading ? (
        <div className="loading">{fr.admin.loadingReports}</div>
      ) : (
        <div className="runs-table-container">
          <table className="runs-table">
            <caption className="sr-only">{fr.admin.moderationCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{fr.admin.date}</th>
                <th scope="col">{fr.admin.daily}</th>
                <th scope="col">{fr.admin.score}</th>
                <th scope="col">{fr.admin.report}</th>
                <th scope="col">{fr.admin.invalidationReason}</th>
                <th scope="col">{fr.admin.action}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const reason = reasons[report.id] ?? report.reason;
                const length = reason.trim().length;
                return (
                  <tr key={report.id}>
                    <td>{formatAdminDate(report.createdAt)}</td>
                    <td>{formatAdminDay(report.dailyDate)}</td>
                    <td>{formatAdminNumber(report.score)}</td>
                    <td>{report.reason}</td>
                    <td>
                      <label className="sr-only" htmlFor={`invalidation-reason-${report.id}`}>
                        {fr.admin.invalidationReason}
                      </label>
                      <textarea
                        id={`invalidation-reason-${report.id}`}
                        className="admin-invalidation-reason"
                        value={reason}
                        minLength={10}
                        maxLength={500}
                        onChange={(event) =>
                          setReasons((current) => ({
                            ...current,
                            [report.id]: event.target.value,
                          }))
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={length < 10 || length > 500 || pendingId !== null}
                        onClick={() => void invalidate(report)}
                      >
                        {pendingId === report.id ? fr.admin.invalidating : fr.admin.invalidateScore}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {reports.length === 0 && <div className="no-data">{fr.admin.noReports}</div>}
        </div>
      )}
    </section>
  );
}
