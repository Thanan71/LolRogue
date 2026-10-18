import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { AdminAuthorityPanel } from './admin/AdminAuthorityPanel';
import { AdminDashboardPanel } from './admin/AdminDashboardPanel';
import { AdminErrorNotice } from './admin/AdminErrorNotice';
import { AdminModerationPanel } from './admin/AdminModerationPanel';
import { AdminSectionFeedback, AdminTableCount } from './admin/AdminSectionFeedback';
import { AdminTabList } from './admin/AdminTabList';
import { AdminAnalyticsPanel } from './admin/analytics/AdminAnalyticsPanel';
import { useAdminAnalytics } from './admin/analytics/useAdminAnalytics';
import { AdminPlayersPanel } from './admin/players/AdminPlayersPanel';
import { useAdminPlayersExplorer } from './admin/players/useAdminPlayersExplorer';
import { AdminRunsPanel } from './admin/runs/AdminRunsPanel';
import { useAdminRunExplorer } from './admin/runs/useAdminRunExplorer';
import { useAdminData } from './admin/useAdminData';
import { formatAdminDate, formatAdminNumber, getLogLevelClass } from './adminPageUtils';
import '@/styles/admin.css';
import '@/styles/admin-analytics.css';

const AdminBalanceWorkspace = lazy(() => import('./admin/balance/AdminBalanceWorkspace'));

const LOG_LEVEL_LABELS: Readonly<Record<string, string>> = {
  error: fr.admin.error,
  warn: fr.admin.warning,
  info: fr.admin.info,
  debug: fr.admin.debug,
};

const LOG_OPERATION_LABELS: Readonly<Record<string, string>> = {
  select: fr.admin.selectOperation,
  insert: fr.admin.insertOperation,
  update: fr.admin.updateOperation,
  delete: fr.admin.deleteOperation,
  auth: fr.admin.authenticationOperation,
  other: fr.admin.otherOperation,
};

export function AdminPage() {
  const { player, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const {
    activeTab,
    setActiveTab,
    stats,
    authorityAggregates,
    authoritySignals,
    authorityRejections,
    logs,
    statsLoading,
    authorityLoading,
    logsLoading,
    moderationLoading,
    moderationReports,
    errors,
    sections,
    logsTotal,
    moderationTotal,
    logFilter,
    setLogFilter,
    fetchStats,
    fetchAuthorityObservability,
    fetchLogs,
    fetchModerationReports,
    invalidateDailyScore,
  } = useAdminData(isAdmin);
  const [balanceVisited, setBalanceVisited] = useState(false);
  const selectTab = (tab: Parameters<typeof setActiveTab>[0]) => {
    if (tab === 'balance') setBalanceVisited(true);
    setActiveTab(tab);
  };
  const playersExplorer = useAdminPlayersExplorer();
  const runExplorer = useAdminRunExplorer();
  const analytics = useAdminAnalytics(activeTab === 'analytics');

  if (!isAdmin) {
    return (
      <main className="admin-page">
        <div className="admin-error">
          <h1>⛔ {fr.admin.accessDenied}</h1>
          <p>{fr.admin.noPermission}</p>
        </div>
      </main>
    );
  }

  const handleGoHome = () => {
    navigate(ROUTES.MENU);
  };

  return (
    <main className="admin-page">
      <div className="admin-header">
        <button className="admin-back-btn" onClick={handleGoHome} title={fr.admin.home}>
          {fr.common.back}
        </button>
        <h1>🛡️ {fr.admin.title}</h1>
        <p>
          {fr.admin.welcome}, {player?.display_name || player?.username}
        </p>
      </div>

      <AdminTabList activeTab={activeTab} onSelect={selectTab} />

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <AdminDashboardPanel
            loading={statsLoading}
            state={sections.stats}
            stats={stats}
            onSelectTab={selectTab}
            onRefresh={fetchStats}
            error={errors.stats}
          />
        )}

        {activeTab === 'logs' && (
          <section
            className="logs-tab"
            role="tabpanel"
            id="admin-panel-logs"
            aria-labelledby="admin-tab-logs"
          >
            <AdminErrorNotice message={errors.logs} onRetry={fetchLogs} retrying={logsLoading} />
            <AdminSectionFeedback state={sections.logs} />
            <AdminTableCount displayed={logs.length} total={logsTotal} />
            <div className="logs-filters">
              <h3>{fr.admin.filters}</h3>
              <div className="filter-row">
                <label htmlFor="admin-log-level">{fr.admin.level}</label>
                <select
                  id="admin-log-level"
                  value={logFilter.level}
                  onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value })}
                >
                  <option value="all">{fr.admin.allLevels}</option>
                  <option value="error">{fr.admin.error}</option>
                  <option value="warn">{fr.admin.warning}</option>
                  <option value="info">{fr.admin.info}</option>
                  <option value="debug">{fr.admin.debug}</option>
                </select>

                <label htmlFor="admin-log-operation">{fr.admin.operation}</label>
                <select
                  id="admin-log-operation"
                  value={logFilter.operation}
                  onChange={(e) => setLogFilter({ ...logFilter, operation: e.target.value })}
                >
                  <option value="all">{fr.admin.allOperations}</option>
                  <option value="select">{fr.admin.selectOperation}</option>
                  <option value="insert">{fr.admin.insertOperation}</option>
                  <option value="update">{fr.admin.updateOperation}</option>
                  <option value="delete">{fr.admin.deleteOperation}</option>
                  <option value="auth">{fr.admin.authenticationOperation}</option>
                  <option value="other">{fr.admin.otherOperation}</option>
                </select>

                <label htmlFor="admin-log-limit">{fr.admin.limit}</label>
                <select
                  id="admin-log-limit"
                  value={logFilter.limit}
                  onChange={(e) => setLogFilter({ ...logFilter, limit: parseInt(e.target.value) })}
                >
                  <option value="50">{formatAdminNumber(50)}</option>
                  <option value="100">{formatAdminNumber(100)}</option>
                  <option value="500">{formatAdminNumber(500)}</option>
                  <option value="1000">{formatAdminNumber(1000)}</option>
                </select>

                <button onClick={fetchLogs} disabled={logsLoading}>
                  {fr.admin.apply}
                </button>
              </div>
            </div>

            {logsLoading && !sections.logs.hasData ? (
              <div className="loading">{fr.admin.loadingLogs}</div>
            ) : errors.logs && !sections.logs.hasData ? null : (
              <div className="logs-table-container">
                <table className="logs-table">
                  <caption className="sr-only">{fr.admin.logsCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{fr.admin.date}</th>
                      <th scope="col">{fr.admin.level}</th>
                      <th scope="col">{fr.admin.repository}</th>
                      <th scope="col">{fr.admin.method}</th>
                      <th scope="col">{fr.admin.operation}</th>
                      <th scope="col">{fr.admin.duration}</th>
                      <th scope="col">{fr.admin.error}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatAdminDate(log.created_at)}</td>
                        <td className={`admin-log-level ${getLogLevelClass(log.level)}`}>
                          {LOG_LEVEL_LABELS[log.level] ?? log.level.toUpperCase()}
                        </td>
                        <td>{log.repository}</td>
                        <td>{log.method}</td>
                        <td>{LOG_OPERATION_LABELS[log.operation ?? ''] ?? log.operation}</td>
                        <td>
                          {log.duration_ms === null || log.duration_ms === undefined
                            ? fr.admin.unavailable
                            : `${formatAdminNumber(log.duration_ms)} ${fr.admin.milliseconds}`}
                        </td>
                        <td>
                          {log.error_message ? (
                            <details className="admin-details">
                              <summary>{fr.admin.showError}</summary>
                              <p>{log.error_message}</p>
                              {log.error_stack && <pre>{log.error_stack}</pre>}
                            </details>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.length === 0 && <div className="no-data">{fr.admin.noLogs}</div>}
              </div>
            )}
          </section>
        )}

        {activeTab === 'authority' && (
          <AdminAuthorityPanel
            state={sections.authority}
            aggregates={authorityAggregates}
            signals={authoritySignals}
            rejections={authorityRejections}
            loading={authorityLoading}
            error={errors.authority}
            onRefresh={() => void fetchAuthorityObservability()}
          />
        )}

        {activeTab === 'players' && (
          <AdminPlayersPanel
            explorer={playersExplorer}
            onOpenRuns={(playerId) => {
              runExplorer.setPlayerFilter(playerId);
              setActiveTab('runs');
            }}
          />
        )}

        {activeTab === 'runs' && <AdminRunsPanel explorer={runExplorer} />}

        {activeTab === 'analytics' && <AdminAnalyticsPanel analytics={analytics} />}

        <div hidden={activeTab !== 'balance'}>
          {balanceVisited && (
            <Suspense fallback={<p role="status">{fr.common.loading}</p>}>
              <AdminBalanceWorkspace active={activeTab === 'balance'} />
            </Suspense>
          )}
        </div>

        {activeTab === 'moderation' && (
          <AdminModerationPanel
            state={sections.moderation}
            total={moderationTotal}
            reports={moderationReports}
            loading={moderationLoading}
            error={errors.moderation}
            onRetry={() => void fetchModerationReports()}
            onInvalidate={invalidateDailyScore}
          />
        )}
      </div>
    </main>
  );
}
