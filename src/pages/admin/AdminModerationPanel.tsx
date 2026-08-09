import { useState } from 'react';
import { formatAdminDate } from '../adminPageUtils';
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
    if (!window.confirm('Invalider définitivement ce score Daily ?')) return;
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
          <h3>Signalements Daily</h3>
          <p>Chaque invalidation est attribuée et inscrite dans le journal d’audit.</p>
        </div>
        <button onClick={onRetry} disabled={loading}>
          Rafraîchir
        </button>
      </div>

      {loading ? (
        <div className="loading">Chargement des signalements…</div>
      ) : (
        <div className="runs-table-container">
          <table className="runs-table">
            <caption className="sr-only">Signalements de scores Daily ouverts</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Daily</th>
                <th scope="col">Score</th>
                <th scope="col">Signalement</th>
                <th scope="col">Motif d’invalidation</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const reason = reasons[report.id] ?? report.reason;
                const length = reason.trim().length;
                return (
                  <tr key={report.id}>
                    <td>{formatAdminDate(report.createdAt)}</td>
                    <td>{report.dailyDate}</td>
                    <td>{report.score}</td>
                    <td>{report.reason}</td>
                    <td>
                      <label className="sr-only" htmlFor={`invalidation-reason-${report.id}`}>
                        Motif d’invalidation
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
                        {pendingId === report.id ? 'Invalidation…' : 'Invalider le score'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {reports.length === 0 && <div className="no-data">Aucun signalement ouvert</div>}
        </div>
      )}
    </section>
  );
}
