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
import { exportRunsToCSV, formatAdminDate, getLogLevelClass } from './adminPageUtils';
import '@/styles/admin.css';

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
              <h3>Filtres</h3>
              <div className="filter-row">
                <label htmlFor="admin-log-level">Niveau:</label>
                <select
                  id="admin-log-level"
                  value={logFilter.level}
                  onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value })}
                >
                  <option value="all">Tous</option>
                  <option value="error">Erreur</option>
                  <option value="warn">Avertissement</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>

                <label htmlFor="admin-log-operation">Opération:</label>
                <select
                  id="admin-log-operation"
                  value={logFilter.operation}
                  onChange={(e) => setLogFilter({ ...logFilter, operation: e.target.value })}
                >
                  <option value="all">Toutes</option>
                  <option value="select">SELECT</option>
                  <option value="insert">INSERT</option>
                  <option value="update">UPDATE</option>
                  <option value="delete">DELETE</option>
                  <option value="auth">Auth</option>
                  <option value="other">Autre</option>
                </select>

                <label htmlFor="admin-log-limit">Limite:</label>
                <select
                  id="admin-log-limit"
                  value={logFilter.limit}
                  onChange={(e) => setLogFilter({ ...logFilter, limit: parseInt(e.target.value) })}
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                </select>

                <button onClick={fetchLogs} disabled={loading || logsLoading}>
                  Appliquer
                </button>
              </div>
            </div>

            {loading || logsLoading ? (
              <div className="loading">Chargement des logs...</div>
            ) : (
              <div className="logs-table-container">
                <table className="logs-table">
                  <caption className="sr-only">Journal technique filtré</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Niveau</th>
                      <th scope="col">Repository</th>
                      <th scope="col">Méthode</th>
                      <th scope="col">Opération</th>
                      <th scope="col">Durée</th>
                      <th scope="col">Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatAdminDate(log.created_at)}</td>
                        <td className={`admin-log-level ${getLogLevelClass(log.level)}`}>
                          {log.level.toUpperCase()}
                        </td>
                        <td>{log.repository}</td>
                        <td>{log.method}</td>
                        <td>{log.operation}</td>
                        <td>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
                        <td>
                          {log.error_message ? (
                            <details className="admin-details">
                              <summary>Afficher l’erreur</summary>
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
                {logs.length === 0 && <div className="no-data">Aucun log trouvé</div>}
              </div>
            )}
          </section>
        )}

        {activeTab === 'authority' && (
          <AdminAuthorityPanel
            aggregates={authorityAggregates}
            signals={authoritySignals}
            rejections={authorityRejections}
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
              <h3>Liste des Joueurs</h3>
              <button onClick={fetchPlayerStats} disabled={loading || playersLoading}>
                Rafraîchir
              </button>
            </div>

            {loading || playersLoading ? (
              <div className="loading">Chargement...</div>
            ) : (
              <div className="players-table-container">
                <table className="players-table">
                  <caption className="sr-only">Joueurs et statistiques</caption>
                  <thead>
                    <tr>
                      <th scope="col">{fr.admin.username}</th>
                      <th scope="col">Niveau</th>
                      <th scope="col">{fr.admin.runs}</th>
                      <th scope="col">Victoires</th>
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
                            {p.is_admin && <span className="admin-badge">ADMIN</span>}
                          </div>
                        </td>
                        <td>{p.level}</td>
                        <td>{p.total_runs_completed}</td>
                        <td>{p.total_wins}</td>
                        <td>{(p.win_rate ?? 0).toFixed(1)}%</td>
                        <td>{p.total_candies}</td>
                        <td>
                          {p.last_login_at ? formatAdminDate(p.last_login_at) : fr.admin.never}
                        </td>
                        <td>{p.created_at ? formatAdminDate(p.created_at) : fr.admin.never}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {playerStats.length === 0 && <div className="no-data">Aucun joueur trouvé</div>}
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
                  📥 Exporter CSV
                </button>
                <button onClick={fetchRuns} disabled={loading || runsLoading}>
                  🔄 Rafraîchir
                </button>
              </div>
            </div>

            <div className="runs-filters">
              <h4>Filtres</h4>
              <div className="filter-row">
                <label htmlFor="admin-run-result">Résultat:</label>
                <select
                  id="admin-run-result"
                  value={runFilter.won}
                  onChange={(e) =>
                    setRunFilter({ ...runFilter, won: e.target.value as 'all' | 'true' | 'false' })
                  }
                >
                  <option value="all">Tous</option>
                  <option value="true">Victoires uniquement</option>
                  <option value="false">Défaites uniquement</option>
                </select>

                <label htmlFor="admin-run-min-waves">Min Vagues:</label>
                <input
                  id="admin-run-min-waves"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={runFilter.minWaves}
                  onChange={(e) => setRunFilter({ ...runFilter, minWaves: e.target.value })}
                  className="admin-number-filter"
                />

                <label htmlFor="admin-run-max-waves">Max Vagues:</label>
                <input
                  id="admin-run-max-waves"
                  type="number"
                  min="0"
                  placeholder="∞"
                  value={runFilter.maxWaves}
                  onChange={(e) => setRunFilter({ ...runFilter, maxWaves: e.target.value })}
                  className="admin-number-filter"
                />

                <label htmlFor="admin-run-sort">Trier par:</label>
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
                  <option value="completed_at">Date de fin</option>
                  <option value="waves_completed">Vagues complétées</option>
                  <option value="run_level">Niveau de partie</option>
                </select>

                <label htmlFor="admin-run-order">Ordre:</label>
                <select
                  id="admin-run-order"
                  value={runFilter.sortOrder}
                  onChange={(e) =>
                    setRunFilter({ ...runFilter, sortOrder: e.target.value as 'asc' | 'desc' })
                  }
                >
                  <option value="desc">Descendant</option>
                  <option value="asc">Ascendant</option>
                </select>

                <label htmlFor="admin-run-limit">Limite:</label>
                <select
                  id="admin-run-limit"
                  value={runFilter.limit}
                  onChange={(e) => setRunFilter({ ...runFilter, limit: parseInt(e.target.value) })}
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                </select>

                <button onClick={fetchRuns} disabled={loading || runsLoading}>
                  Appliquer
                </button>
              </div>
            </div>

            {loading || runsLoading ? (
              <div className="loading">Chargement des parties…</div>
            ) : (
              <>
                <div className="runs-summary">
                  <span className="summary-text">
                    {runs.length} run{runs.length > 1 ? 's' : ''} affiché
                    {runs.length > 1 ? 's' : ''}
                  </span>
                  {runs.length > 0 && (
                    <>
                      <span className="summary-stat">
                        Taux de victoire:{' '}
                        {((runs.filter((r) => r.won).length / runs.length) * 100).toFixed(1)}%
                      </span>
                      <span className="summary-stat">
                        Moyenne vagues:{' '}
                        {(
                          runs.reduce((sum, r) => sum + (r.waves_completed || 0), 0) / runs.length
                        ).toFixed(1)}
                      </span>
                    </>
                  )}
                </div>

                <div className="runs-table-container">
                  <table className="runs-table">
                    <caption className="sr-only">Historique filtré des runs</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Joueur</th>
                        <th scope="col">Résultat</th>
                        <th scope="col">Niveau</th>
                        <th scope="col">Vagues</th>
                        <th scope="col">Biomes</th>
                        <th scope="col">{fr.admin.kills}</th>
                        <th scope="col">Dégâts</th>
                        <th scope="col">Or</th>
                        <th scope="col">{fr.common.candies}</th>
                        <th scope="col">Durée</th>
                        <th scope="col">Équipe</th>
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
                              {run.won ? '✓ Victoire' : '✗ Défaite'}
                            </span>
                          </td>
                          <td className="level-cell">{run.run_level}</td>
                          <td className="waves-cell">{run.waves_completed}</td>
                          <td className="biomes-cell" title={run.biomes_visited?.join(' → ')}>
                            {run.biomes_visited?.length || 0} biomes
                          </td>
                          <td>{run.total_kills || 0}</td>
                          <td>{(run.total_damage_dealt || 0).toLocaleString()}</td>
                          <td>{run.gold_earned || 0}</td>
                          <td className="candies-cell">{run.candies_earned || 0}</td>
                          <td>
                            {run.duration_seconds
                              ? `${Math.floor(run.duration_seconds / 60)}min`
                              : '-'}
                          </td>
                          <td className="team-cell">
                            <details className="admin-details">
                              <summary>{run.team_members?.length || 0} champions</summary>
                              <ul>
                                {run.team_members?.map((member) => (
                                  <li key={member.id}>
                                    {member.champion_id}: Niv{member.final_level}{' '}
                                    {member.survived ? '✓' : '✗'} (K:{member.kills} D:
                                    {member.damage_dealt})
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
