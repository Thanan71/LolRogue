import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { AdminAuthorityPanel } from './admin/AdminAuthorityPanel';
import { AdminDashboardPanel } from './admin/AdminDashboardPanel';
import { AdminErrorNotice } from './admin/AdminErrorNotice';
import { AdminModerationPanel } from './admin/AdminModerationPanel';
import { AdminTabList } from './admin/AdminTabList';
import { useAdminData } from './admin/useAdminData';
import {
  exportRunsToCSV,
  formatAdminCount,
  formatAdminDate,
  formatAdminNumber,
  formatAdminPercent,
  getLogLevelClass,
} from './adminPageUtils';
import '@/styles/admin.css';

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

function biomeName(biomeId: string): string {
  return fr.run.biomeNames[biomeId as keyof typeof fr.run.biomeNames] ?? biomeId;
}

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
    fieldCohorts,
    fieldChampionCohorts,
    fieldAugmentCohorts,
    playerStats,
    logs,
    loading,
    statsLoading,
    authorityLoading,
    logsLoading,
    playersLoading,
    runsLoading,
    runs,
    moderationLoading,
    moderationReports,
    errors,
    runFilter,
    setRunFilter,
    logFilter,
    setLogFilter,
    fetchStats,
    fetchAuthorityObservability,
    fetchPlayerStats,
    fetchLogs,
    fetchRuns,
    fetchModerationReports,
    invalidateDailyScore,
  } = useAdminData(isAdmin);

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

      <AdminTabList activeTab={activeTab} onSelect={setActiveTab} />

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <AdminDashboardPanel
            loading={loading || statsLoading}
            stats={stats}
            onSelectTab={setActiveTab}
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
            <AdminErrorNotice
              message={errors.logs}
              onRetry={fetchLogs}
              retrying={loading || logsLoading}
            />
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

                <button onClick={fetchLogs} disabled={loading || logsLoading}>
                  {fr.admin.apply}
                </button>
              </div>
            </div>

            {loading || logsLoading ? (
              <div className="loading">{fr.admin.loadingLogs}</div>
            ) : (
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
                          {log.duration_ms
                            ? `${formatAdminNumber(log.duration_ms)} ${fr.admin.milliseconds}`
                            : '-'}
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
            aggregates={authorityAggregates}
            signals={authoritySignals}
            rejections={authorityRejections}
            fieldCohorts={fieldCohorts}
            fieldChampionCohorts={fieldChampionCohorts}
            fieldAugmentCohorts={fieldAugmentCohorts}
            loading={loading || authorityLoading}
            error={errors.authority}
            onRefresh={() => void fetchAuthorityObservability()}
          />
        )}

        {activeTab === 'players' && (
          <section
            className="players-tab"
            role="tabpanel"
            id="admin-panel-players"
            aria-labelledby="admin-tab-players"
          >
            <AdminErrorNotice
              message={errors.players}
              onRetry={fetchPlayerStats}
              retrying={loading || playersLoading}
            />
            <div className="players-header">
              <h3>{fr.admin.playerList}</h3>
              <button onClick={fetchPlayerStats} disabled={loading || playersLoading}>
                {fr.admin.refresh}
              </button>
            </div>

            {loading || playersLoading ? (
              <div className="loading">{fr.admin.loadingPlayers}</div>
            ) : (
              <div className="players-table-container">
                <table className="players-table">
                  <caption className="sr-only">{fr.admin.playersCaption}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{fr.admin.username}</th>
                      <th scope="col">{fr.admin.level}</th>
                      <th scope="col">{fr.admin.runs}</th>
                      <th scope="col">{fr.admin.victories}</th>
                      <th scope="col">{fr.admin.winRate}</th>
                      <th scope="col">{fr.common.candies}</th>
                      <th scope="col">{fr.admin.lastLogin}</th>
                      <th scope="col">{fr.admin.registeredAt}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="player-name">
                            {p.display_name || p.username}
                            {p.is_admin && (
                              <span className="admin-badge">{fr.admin.adminRole}</span>
                            )}
                          </div>
                        </td>
                        <td>{formatAdminNumber(p.level ?? 0)}</td>
                        <td>{formatAdminNumber(p.total_runs_completed ?? 0)}</td>
                        <td>{formatAdminNumber(p.total_wins ?? 0)}</td>
                        <td>{formatAdminPercent((p.win_rate ?? 0) / 100)}</td>
                        <td>{formatAdminNumber(p.total_candies ?? 0)}</td>
                        <td>
                          {p.last_login_at ? formatAdminDate(p.last_login_at) : fr.admin.never}
                        </td>
                        <td>{p.created_at ? formatAdminDate(p.created_at) : fr.admin.never}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {playerStats.length === 0 && <div className="no-data">{fr.admin.noPlayers}</div>}
              </div>
            )}
          </section>
        )}

        {activeTab === 'runs' && (
          <section
            className="runs-tab"
            role="tabpanel"
            id="admin-panel-runs"
            aria-labelledby="admin-tab-runs"
          >
            <AdminErrorNotice
              message={errors.runs}
              onRetry={fetchRuns}
              retrying={loading || runsLoading}
            />
            <div className="runs-header">
              <h3>{fr.admin.runHistory}</h3>
              <div className="runs-actions">
                <button
                  className="export-btn"
                  onClick={() => exportRunsToCSV(runs)}
                  disabled={loading || runsLoading || runs.length === 0}
                  title={fr.admin.exportCsv}
                >
                  📥 {fr.admin.exportCsv}
                </button>
                <button onClick={fetchRuns} disabled={loading || runsLoading}>
                  🔄 {fr.admin.refresh}
                </button>
              </div>
            </div>

            <div className="runs-filters">
              <h4>{fr.admin.filters}</h4>
              <div className="filter-row">
                <label htmlFor="admin-run-result">{fr.admin.result}</label>
                <select
                  id="admin-run-result"
                  value={runFilter.won}
                  onChange={(e) =>
                    setRunFilter({ ...runFilter, won: e.target.value as 'all' | 'true' | 'false' })
                  }
                >
                  <option value="all">{fr.admin.allResults}</option>
                  <option value="true">{fr.admin.winsOnly}</option>
                  <option value="false">{fr.admin.lossesOnly}</option>
                </select>

                <label htmlFor="admin-run-min-waves">{fr.admin.minWaves}</label>
                <input
                  id="admin-run-min-waves"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={runFilter.minWaves}
                  onChange={(e) => setRunFilter({ ...runFilter, minWaves: e.target.value })}
                  className="admin-number-filter"
                />

                <label htmlFor="admin-run-max-waves">{fr.admin.maxWaves}</label>
                <input
                  id="admin-run-max-waves"
                  type="number"
                  min="0"
                  placeholder="∞"
                  value={runFilter.maxWaves}
                  onChange={(e) => setRunFilter({ ...runFilter, maxWaves: e.target.value })}
                  className="admin-number-filter"
                />

                <label htmlFor="admin-run-sort">{fr.admin.sortBy}</label>
                <select
                  id="admin-run-sort"
                  value={runFilter.sortBy}
                  onChange={(e) =>
                    setRunFilter({
                      ...runFilter,
                      sortBy: e.target.value as 'completed_at' | 'waves_completed' | 'run_level',
                    })
                  }
                >
                  <option value="completed_at">{fr.admin.completedAt}</option>
                  <option value="waves_completed">{fr.admin.wavesCompleted}</option>
                  <option value="run_level">{fr.admin.runLevel}</option>
                </select>

                <label htmlFor="admin-run-order">{fr.admin.order}</label>
                <select
                  id="admin-run-order"
                  value={runFilter.sortOrder}
                  onChange={(e) =>
                    setRunFilter({ ...runFilter, sortOrder: e.target.value as 'asc' | 'desc' })
                  }
                >
                  <option value="desc">{fr.admin.descending}</option>
                  <option value="asc">{fr.admin.ascending}</option>
                </select>

                <label htmlFor="admin-run-limit">{fr.admin.limit}</label>
                <select
                  id="admin-run-limit"
                  value={runFilter.limit}
                  onChange={(e) => setRunFilter({ ...runFilter, limit: parseInt(e.target.value) })}
                >
                  <option value="50">{formatAdminNumber(50)}</option>
                  <option value="100">{formatAdminNumber(100)}</option>
                  <option value="500">{formatAdminNumber(500)}</option>
                  <option value="1000">{formatAdminNumber(1000)}</option>
                </select>

                <button onClick={fetchRuns} disabled={loading || runsLoading}>
                  {fr.admin.apply}
                </button>
              </div>
            </div>

            {loading || runsLoading ? (
              <div className="loading">{fr.admin.loadingRuns}</div>
            ) : (
              <>
                <div className="runs-summary">
                  <span className="summary-text">
                    {formatAdminCount(runs.length, fr.admin.displayedRun, fr.admin.displayedRuns)}
                  </span>
                  {runs.length > 0 && (
                    <>
                      <span className="summary-stat">
                        {fr.admin.winRate}:{' '}
                        {formatAdminPercent(runs.filter((run) => run.won).length / runs.length)}
                      </span>
                      <span className="summary-stat">
                        {fr.admin.averageWaves}:{' '}
                        {formatAdminNumber(
                          runs.reduce((sum, run) => sum + (run.waves_completed ?? 0), 0) /
                            runs.length,
                          { minimumFractionDigits: 1, maximumFractionDigits: 1 },
                        )}
                      </span>
                    </>
                  )}
                </div>

                <div className="runs-table-container">
                  <table className="runs-table">
                    <caption className="sr-only">{fr.admin.filteredRunsCaption}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{fr.admin.date}</th>
                        <th scope="col">{fr.admin.player}</th>
                        <th scope="col">{fr.admin.result}</th>
                        <th scope="col">{fr.admin.level}</th>
                        <th scope="col">{fr.admin.waves}</th>
                        <th scope="col">{fr.admin.biomes}</th>
                        <th scope="col">{fr.admin.kills}</th>
                        <th scope="col">{fr.admin.damage}</th>
                        <th scope="col">{fr.admin.gold}</th>
                        <th scope="col">{fr.common.candies}</th>
                        <th scope="col">{fr.admin.duration}</th>
                        <th scope="col">{fr.admin.team}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className={run.won ? 'win-row' : 'loss-row'}>
                          <td>{run.completed_at ? formatAdminDate(run.completed_at) : '-'}</td>
                          <td>
                            <div className="player-name">
                              {run.player_display_name || run.player_username || fr.admin.unknown}
                            </div>
                          </td>
                          <td>
                            <span className={`result-badge ${run.won ? 'win' : 'loss'}`}>
                              {run.won ? `✓ ${fr.admin.victory}` : `✗ ${fr.admin.defeat}`}
                            </span>
                          </td>
                          <td className="level-cell">{formatAdminNumber(run.run_level ?? 0)}</td>
                          <td className="waves-cell">
                            {formatAdminNumber(run.waves_completed ?? 0)}
                          </td>
                          <td
                            className="biomes-cell"
                            title={run.biomes_visited?.map(biomeName).join(' → ')}
                          >
                            {formatAdminCount(
                              run.biomes_visited?.length ?? 0,
                              fr.admin.biome,
                              fr.admin.biomePlural,
                            )}
                          </td>
                          <td>{formatAdminNumber(run.total_kills ?? 0)}</td>
                          <td>{formatAdminNumber(run.total_damage_dealt ?? 0)}</td>
                          <td>{formatAdminNumber(run.gold_earned ?? 0)}</td>
                          <td className="candies-cell">
                            {formatAdminNumber(run.candies_earned ?? 0)}
                          </td>
                          <td>
                            {run.duration_seconds
                              ? formatAdminCount(
                                  Math.floor(run.duration_seconds / 60),
                                  fr.admin.minute,
                                  fr.admin.minutes,
                                )
                              : '-'}
                          </td>
                          <td className="team-cell">
                            <details className="admin-details">
                              <summary>
                                {formatAdminCount(
                                  run.team_members?.length ?? 0,
                                  fr.admin.champion,
                                  fr.admin.champions,
                                )}
                              </summary>
                              <ul>
                                {run.team_members?.map((member) => (
                                  <li key={member.id}>
                                    {member.champion_id}: {fr.admin.levelShort}{' '}
                                    {formatAdminNumber(member.final_level)}{' '}
                                    {member.survived ? '✓' : '✗'} ({fr.admin.killsShort}:{' '}
                                    {formatAdminNumber(member.kills)} {fr.admin.damageShort}:{' '}
                                    {formatAdminNumber(member.damage_dealt)})
                                  </li>
                                ))}
                              </ul>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {runs.length === 0 && <div className="no-data">{fr.admin.noRuns}</div>}
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === 'moderation' && (
          <AdminModerationPanel
            reports={moderationReports}
            loading={loading || moderationLoading}
            error={errors.moderation}
            onRetry={() => void fetchModerationReports()}
            onInvalidate={invalidateDailyScore}
          />
        )}
      </div>
    </main>
  );
}
