import type {
  AuthorityAttemptAggregate,
  AuthorityRejectionSignal,
} from '@/observability/authorityRejectionMonitor';
import { formatAdminDate } from '../adminPageUtils';
import { AdminErrorNotice } from './AdminErrorNotice';
import type { AdminAuthorityRejection } from './useAdminData';

interface AdminAuthorityPanelProps {
  aggregates: AuthorityAttemptAggregate[];
  signals: AuthorityRejectionSignal[];
  rejections: AdminAuthorityRejection[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function AdminAuthorityPanel({
  aggregates,
  signals,
  rejections,
  loading,
  error,
  onRefresh,
}: AdminAuthorityPanelProps) {
  const totals = aggregates.reduce(
    (sum, aggregate) => ({
      attempts: sum.attempts + aggregate.attemptCount,
      started: sum.started + aggregate.startedCount,
      finished: sum.finished + aggregate.finishedCount,
      verified: sum.verified + aggregate.verifiedCount,
      rejected: sum.rejected + aggregate.rejectedCount,
      expired: sum.expired + aggregate.expiredCount,
    }),
    { attempts: 0, started: 0, finished: 0, verified: 0, rejected: 0, expired: 0 },
  );

  return (
    <section
      className="authority-tab"
      role="tabpanel"
      id="admin-panel-authority"
      aria-labelledby="admin-tab-authority"
    >
      <AdminErrorNotice message={error} onRetry={onRefresh} retrying={loading} />
      <div className="authority-header">
        <div>
          <h3>Surveillance authority</h3>
          <p>Fenêtre glissante de 15 minutes, regroupée par version moteur et ruleset.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          Rafraîchir
        </button>
      </div>

      {loading ? (
        <div className="loading">Chargement de la surveillance…</div>
      ) : (
        <>
          {signals.length > 0 ? (
            <div className="authority-alerts" role="alert">
              <strong>Alerte de vérification authority</strong>
              {signals.map((signal) => (
                <p key={`${signal.engineVersion}-${signal.gameplayRulesetVersion}`}>
                  {signal.engineVersion} / gameplay v{signal.gameplayRulesetVersion} :{' '}
                  {(signal.rejectionRate * 100).toFixed(1)} % de rejets ({signal.rejectedCount}/
                  {signal.attemptCount}) — {signal.reasons.join(', ')}
                  {signal.unknownCodes.length > 0
                    ? ` — nouveaux codes : ${signal.unknownCodes.join(', ')}`
                    : ''}
                </p>
              ))}
            </div>
          ) : (
            <p className="authority-ok" role="status">
              Aucun seuil de rejet anormal détecté sur la fenêtre courante.
            </p>
          )}

          <div className="stats-grid authority-stats">
            {[
              ['Attempts', totals.attempts],
              ['Démarrées', totals.started],
              ['À vérifier', totals.finished],
              ['Vérifiées', totals.verified],
              ['Rejetées', totals.rejected],
              ['Expirées', totals.expired],
            ].map(([label, value]) => (
              <div className="stat-card" key={label}>
                <div className="stat-value">{value}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>

          <div className="authority-rejections-header">
            <h4>20 derniers rejets</h4>
            <span>{rejections.length} affiché(s)</span>
          </div>
          <div className="runs-table-container">
            <table className="runs-table">
              <caption className="sr-only">Derniers rejets de vérification authority</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Attempt</th>
                  <th scope="col">Moteur</th>
                  <th scope="col">Gameplay</th>
                  <th scope="col">Code</th>
                </tr>
              </thead>
              <tbody>
                {rejections.map((rejection) => (
                  <tr key={rejection.attemptId}>
                    <td>{formatAdminDate(rejection.rejectedAt)}</td>
                    <td>
                      <code>{rejection.attemptId}</code>
                    </td>
                    <td>{rejection.engineVersion}</td>
                    <td>v{rejection.gameplayRulesetVersion}</td>
                    <td>
                      <code>{rejection.rejectionCode}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rejections.length === 0 && <div className="no-data">Aucun rejet enregistré</div>}
          </div>
        </>
      )}
    </section>
  );
}
