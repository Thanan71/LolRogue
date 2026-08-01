import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import type { AdminPlayerStat, Log, RunTeamMember } from '@/types/models';
import {
  type AdminRun,
  exportRunsToCSV,
  formatAdminDate,
  getLogLevelColor,
} from './adminPageUtils';
import '@/styles/admin.css';

type TabType = 'dashboard' | 'logs' | 'players' | 'runs';

export function AdminPage() {
  const { player, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [stats, setStats] = useState<Record<string, string>>({});
  const [playerStats, setPlayerStats] = useState<AdminPlayerStat[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [runFilter, setRunFilter] = useState({
    won: 'all' as 'all' | 'true' | 'false',
    minWaves: '' as string,
    maxWaves: '' as string,
    sortBy: 'completed_at' as 'completed_at' | 'waves_completed' | 'run_level',
    sortOrder: 'desc' as 'asc' | 'desc',
    limit: 100,
  });
  const [logFilter, setLogFilter] = useState({
    level: 'all' as string,
    operation: 'all' as string,
    limit: 100,
  });

  // Check admin status on mount
  useEffect(() => {
    if (!isAdmin) {
      useAuthStore.getState().checkAdminStatus();
    }
  }, [isAdmin]);

  // Fetch dashboard stats
  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.from('admin_stats').select('*');

      if (error) throw error;

      const statsMap: Record<string, string> = {};
      data?.forEach((stat) => {
        if (stat.stat_name && stat.stat_value) {
          statsMap[stat.stat_name] = stat.stat_value;
        }
      });
      setStats(statsMap);
    } catch (error) {
      console.error('[AdminPage] Error fetching stats:', error);
    }
  };

  // Fetch player stats
  const fetchPlayerStats = async () => {
    setPlayersLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_player_stats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPlayerStats((data || []) as AdminPlayerStat[]);
    } catch (error) {
      console.error('[AdminPage] Error fetching player stats:', error);
    } finally {
      setPlayersLoading(false);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      let query = supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(logFilter.limit);

      if (logFilter.level !== 'all') {
        query = query.eq('level', logFilter.level);
      }
      if (logFilter.operation !== 'all') {
        query = query.eq('operation', logFilter.operation);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data || []) as Log[]);
    } catch (error) {
      console.error('[AdminPage] Error fetching logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  // Fetch runs with filters
  const fetchRuns = async () => {
    setRunsLoading(true);
    try {
      // First, fetch runs with filters
      let query = supabase
        .from('runs')
        .select(`
          *,
          player_username:player_id(username),
          player_display_name:player_id(display_name)
        `)
        .order(runFilter.sortBy, { ascending: runFilter.sortOrder === 'asc' })
        .limit(runFilter.limit);

      // Apply won filter
      if (runFilter.won !== 'all') {
        query = query.eq('won', runFilter.won === 'true');
      }

      // Apply waves filters
      if (runFilter.minWaves) {
        query = query.gte('waves_completed', parseInt(runFilter.minWaves));
      }
      if (runFilter.maxWaves) {
        query = query.lte('waves_completed', parseInt(runFilter.maxWaves));
      }

      const { data: runsData, error: runsError } = await query;

      if (runsError) throw runsError;

      // Fetch team members for each run
      const runIds = runsData?.map((r) => r.id) || [];
      let teamMembers: RunTeamMember[] = [];

      if (runIds.length > 0) {
        const { data: tmData, error: tmError } = await supabase
          .from('run_team_members')
          .select('*')
          .in('run_id', runIds);

        if (!tmError && tmData) {
          teamMembers = tmData;
        }
      }

      // Combine runs with team members
      const runsWithTeam = (runsData || []).map((run) => ({
        ...run,
        player_username: run.player_username?.username || 'Unknown',
        player_display_name: run.player_display_name?.display_name || null,
        team_members: teamMembers.filter((tm) => tm.run_id === run.id),
      }));

      setRuns(runsWithTeam as AdminRun[]);
    } catch (error) {
      console.error('[AdminPage] Error fetching runs:', error);
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (isAdmin) {
      setLoading(true);
      fetchStats();
      setLoading(false);
    }
  }, [isAdmin]);

  // Fetch data when tab changes
  useEffect(() => {
    if (isAdmin) {
      switch (activeTab) {
        case 'players':
          fetchPlayerStats();
          break;
        case 'logs':
          fetchLogs();
          break;
        case 'runs':
          fetchRuns();
          break;
      }
    }
  }, [activeTab, logFilter, runFilter]);

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-error">
          <h2>⛔ {fr.admin.accessDenied}</h2>
          <p>{fr.admin.noPermission}</p>
        </div>
      </div>
    );
  }

  const handleGoHome = () => {
    navigate(ROUTES.MENU);
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <button className="admin-back-btn" onClick={handleGoHome} title={fr.admin.home}>
          {fr.common.back}
        </button>
        <h1>🛡️ {fr.admin.title}</h1>
        <p>
          {fr.admin.welcome}, {player?.display_name || player?.username}
        </p>
      </div>

      <div className="admin-nav">
        <button
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 {fr.admin.dashboard}
        </button>
        <button
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => setActiveTab('logs')}
        >
          📋 {fr.admin.logs}
        </button>
        <button
          className={activeTab === 'players' ? 'active' : ''}
          onClick={() => setActiveTab('players')}
        >
          👥 {fr.admin.players}
        </button>
        <button
          className={activeTab === 'runs' ? 'active' : ''}
          onClick={() => setActiveTab('runs')}
        >
          🎮 {fr.admin.runs}
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <div className="dashboard-tab">
            {loading ? (
              <div className="loading">Chargement...</div>
            ) : (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{stats.total_players || '0'}</div>
                  <div className="stat-label">{fr.admin.totalPlayers}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.active_today || '0'}</div>
                  <div className="stat-label">{fr.admin.activeToday}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_runs || '0'}</div>
                  <div className="stat-label">{fr.admin.totalRuns}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_daily_runs || '0'}</div>
                  <div className="stat-label">{fr.admin.dailyRuns}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_wins || '0'}</div>
                  <div className="stat-label">{fr.admin.totalWins}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_candies_earned || '0'}</div>
                  <div className="stat-label">{fr.admin.candiesEarned}</div>
                </div>
              </div>
            )}

            <div className="admin-quick-actions">
              <h3>{fr.admin.quickActions}</h3>
              <div className="action-buttons">
                <button onClick={() => setActiveTab('logs')}>{fr.admin.viewLogs}</button>
                <button onClick={() => setActiveTab('players')}>{fr.admin.managePlayers}</button>
                <button onClick={fetchStats}>{fr.admin.refreshStats}</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-tab">
            <div className="logs-filters">
              <h3>Filtres</h3>
              <div className="filter-row">
                <label>Niveau:</label>
                <select
                  value={logFilter.level}
                  onChange={(e) => setLogFilter({ ...logFilter, level: e.target.value })}
                >
                  <option value="all">Tous</option>
                  <option value="error">Erreur</option>
                  <option value="warn">Avertissement</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>

                <label>Opération:</label>
                <select
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

                <label>Limite:</label>
                <select
                  value={logFilter.limit}
                  onChange={(e) => setLogFilter({ ...logFilter, limit: parseInt(e.target.value) })}
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                </select>

                <button onClick={fetchLogs}>Appliquer</button>
              </div>
            </div>

            {logsLoading ? (
              <div className="loading">Chargement des logs...</div>
            ) : (
              <div className="logs-table-container">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Niveau</th>
                      <th>Repository</th>
                      <th>Méthode</th>
                      <th>Opération</th>
                      <th>Durée</th>
                      <th>Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatAdminDate(log.created_at)}</td>
                        <td style={{ color: getLogLevelColor(log.level) }}>
                          {log.level.toUpperCase()}
                        </td>
                        <td>{log.repository}</td>
                        <td>{log.method}</td>
                        <td>{log.operation}</td>
                        <td>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</td>
                        <td title={log.error_stack || ''}>{log.error_message ? '❌' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.length === 0 && <div className="no-data">Aucun log trouvé</div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'players' && (
          <div className="players-tab">
            <div className="players-header">
              <h3>Liste des Joueurs</h3>
              <button onClick={fetchPlayerStats}>Rafraîchir</button>
            </div>

            {playersLoading ? (
              <div className="loading">Chargement...</div>
            ) : (
              <div className="players-table-container">
                <table className="players-table">
                  <thead>
                    <tr>
                      <th>{fr.admin.username}</th>
                      <th>Niveau</th>
                      <th>{fr.admin.runs}</th>
                      <th>Victoires</th>
                      <th>{fr.admin.winRate}</th>
                      <th>{fr.common.candies}</th>
                      <th>{fr.admin.lastLogin}</th>
                      <th>{fr.admin.registeredAt}</th>
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
                        <td>{p.win_rate.toFixed(1)}%</td>
                        <td>{p.total_candies}</td>
                        <td>
                          {p.last_login_at ? formatAdminDate(p.last_login_at) : fr.admin.never}
                        </td>
                        <td>{formatAdminDate(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {playerStats.length === 0 && <div className="no-data">Aucun joueur trouvé</div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="runs-tab">
            <div className="runs-header">
              <h3>{fr.admin.runHistory}</h3>
              <div className="runs-actions">
                <button
                  className="export-btn"
                  onClick={() => exportRunsToCSV(runs)}
                  disabled={runs.length === 0}
                  title={fr.admin.exportCsv}
                >
                  📥 Exporter CSV
                </button>
                <button onClick={fetchRuns}>🔄 Rafraîchir</button>
              </div>
            </div>

            <div className="runs-filters">
              <h4>Filtres</h4>
              <div className="filter-row">
                <label>Résultat:</label>
                <select
                  value={runFilter.won}
                  onChange={(e) =>
                    setRunFilter({ ...runFilter, won: e.target.value as 'all' | 'true' | 'false' })
                  }
                >
                  <option value="all">Tous</option>
                  <option value="true">Victoires uniquement</option>
                  <option value="false">Défaites uniquement</option>
                </select>

                <label>Min Vagues:</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={runFilter.minWaves}
                  onChange={(e) => setRunFilter({ ...runFilter, minWaves: e.target.value })}
                  style={{
                    width: '60px',
                    padding: '0.5rem',
                    background: 'rgba(10, 20, 40, 0.8)',
                    border: '1px solid rgba(200, 170, 110, 0.3)',
                    color: '#c8aa6e',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-display)',
                  }}
                />

                <label>Max Vagues:</label>
                <input
                  type="number"
                  min="0"
                  placeholder="∞"
                  value={runFilter.maxWaves}
                  onChange={(e) => setRunFilter({ ...runFilter, maxWaves: e.target.value })}
                  style={{
                    width: '60px',
                    padding: '0.5rem',
                    background: 'rgba(10, 20, 40, 0.8)',
                    border: '1px solid rgba(200, 170, 110, 0.3)',
                    color: '#c8aa6e',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-display)',
                  }}
                />

                <label>Trier par:</label>
                <select
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

                <label>Ordre:</label>
                <select
                  value={runFilter.sortOrder}
                  onChange={(e) =>
                    setRunFilter({ ...runFilter, sortOrder: e.target.value as 'asc' | 'desc' })
                  }
                >
                  <option value="desc">Descendant</option>
                  <option value="asc">Ascendant</option>
                </select>

                <label>Limite:</label>
                <select
                  value={runFilter.limit}
                  onChange={(e) => setRunFilter({ ...runFilter, limit: parseInt(e.target.value) })}
                >
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                </select>

                <button onClick={fetchRuns}>Appliquer</button>
              </div>
            </div>

            {runsLoading ? (
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
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Joueur</th>
                        <th>Résultat</th>
                        <th>Niveau</th>
                        <th>Vagues</th>
                        <th>Biomes</th>
                        <th>{fr.admin.kills}</th>
                        <th>Dégâts</th>
                        <th>Or</th>
                        <th>{fr.common.candies}</th>
                        <th>Durée</th>
                        <th>Équipe</th>
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
                          <td
                            className="team-cell"
                            title={run.team_members
                              ?.map(
                                (tm) =>
                                  `${tm.champion_id}: Niv${tm.final_level} ${tm.survived ? '✓' : '✗'} (K:${tm.kills} D:${tm.damage_dealt})`,
                              )
                              .join('\n')}
                          >
                            {run.team_members?.length || 0} champions
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {runs.length === 0 && <div className="no-data">{fr.admin.noRuns}</div>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
