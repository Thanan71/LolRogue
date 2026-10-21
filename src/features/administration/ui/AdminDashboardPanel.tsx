import { fr } from '@/i18n/fr';
import { AdminErrorNotice } from './AdminErrorNotice';
import { AdminSectionFeedback } from './AdminSectionFeedback';
import {
  ADMIN_METRIC_KEYS,
  formatAdminMetric,
  getAdminMetricDefinition,
  getAdminMetricValue,
} from '../domain/adminMetrics';
import type { AdminTab } from '../domain/adminDataContracts';
import type { AdminSectionFeedback as Feedback } from '../hooks/useAdminSection';

interface AdminDashboardPanelProps {
  loading: boolean;
  stats: Record<string, string | null>;
  onSelectTab: (tab: AdminTab) => void;
  onRefresh: () => void;
  error: string | null;
  state?: Feedback;
}

export function AdminDashboardPanel({
  loading,
  stats,
  onSelectTab,
  onRefresh,
  error,
  state,
}: AdminDashboardPanelProps) {
  return (
    <section
      className="dashboard-tab"
      role="tabpanel"
      id="admin-panel-dashboard"
      aria-labelledby="admin-tab-dashboard"
    >
      <AdminErrorNotice message={error} onRetry={onRefresh} retrying={loading} />
      {state && <AdminSectionFeedback state={state} />}
      {loading && !state?.hasData ? (
        <div className="loading">{fr.admin.loading}</div>
      ) : (
        <div className="stats-grid">
          {ADMIN_METRIC_KEYS.map((key) => {
            const definition = getAdminMetricDefinition(key);
            return (
              <div className="stat-card" key={key} data-metric={key}>
                <div className="stat-value">
                  {formatAdminMetric(
                    getAdminMetricValue(key, stats),
                    definition.unit,
                    fr.admin.unavailable,
                  )}
                </div>
                <div className="stat-label">{definition.label}</div>
                <details className="admin-details">
                  <summary>
                    {fr.admin.metricDetails} — {definition.label}
                  </summary>
                  <p>{definition.formula}</p>
                  <p>{definition.source}</p>
                  <p>
                    {definition.period} · {definition.timezone}
                  </p>
                  <p>{definition.unitLabel}</p>
                  <p>{definition.population}</p>
                  <p>{definition.verification}</p>
                  <p>{definition.aggregation}</p>
                </details>
              </div>
            );
          })}
        </div>
      )}

      <div className="admin-quick-actions">
        <h3>{fr.admin.quickActions}</h3>
        <div className="action-buttons">
          <button onClick={() => onSelectTab('logs')}>{fr.admin.viewLogs}</button>
          <button onClick={() => onSelectTab('players')}>{fr.admin.managePlayers}</button>
          <button onClick={onRefresh} disabled={loading}>
            {fr.admin.refreshStats}
          </button>
        </div>
      </div>
    </section>
  );
}
