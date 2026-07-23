import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES, useRouterStore } from '@/stores/routerStore';
import type { AdminPlayerStat, AdminStat, Log, Run, RunTeamMember } from '@/types/database';
import '@/styles/admin.css';

// Extended run type with player info for admin view
interface AdminRun extends Run {
  player_username: string;
  player_display_name: string | null;
  team_members: RunTeamMember[];
}

type TabType = 'dashboard' | 'logs' | 'players' | 'runs';

export function AdminPage() {
  const { player, isAdmin } = useAuthStore();
  const { navigateTo } = useRouterStore();
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
      data?.forEach((stat: AdminStat) => {
        statsMap[stat.stat_name] = stat.stat_value;
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
      setPlayerStats(data || []);
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
      setLogs(data || []);
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

      setRuns(runsWithTeam);
    } catch (error) {
      console.error('[AdminPage] Error fetching runs:', error);
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  // Export runs to CSV
  const exportRunsToCSV = () => {
    if (runs.length === 0) return;

    // CSV Header - Comprehensive data for game balancing
    const headers = [
      'Run ID',
      'Seed',
      'Joueur',
      'Nom Affiché',
      'Victoire',
      'Niveau de Run',
      'Vagues Complétées',
      'Biomes Visités',
      'Nodes Complétés',
      'Combats Gagnés',
      'Combats Perdus',
      'Elite Kills',
      'Boss Kills',
      'Or Gagné',
      'Or Dépensé',
      'Total Kills',
      'Dégâts Infligés',
      'Dégâts Reçus',
      'Soins Donnés',
      'Soins Reçus',
      'Candies Gagnés',
      'Durée (secondes)',
      'Commencé le',
      'Complété le',
      'Champions Recrutés',
      'Items Achetés',
      'Équipe (Champions)',
      'Détails Champions',
    ];

    // CSV Rows
    const rows = runs.map((run) => {
      const biomesVisited = run.biomes_visited?.join('; ') || '';
      const champions = run.team_members?.map((tm) => tm.champion_id).join('; ') || '';
      const championDetails =
        run.team_members
          ?.map(
            (tm) =>
              `${tm.champion_id}: Niv${tm.final_level} ${tm.survived ? '✓' : '✗'} K:${tm.kills} D:${tm.damage_dealt} DR:${tm.damage_received || 0} H:${tm.healing_done || 0} HP:${tm.final_hp}`,
          )
          .join(' | ') || '';

      return [
        run.run_uuid,
        run.seed || '',
        run.player_username || 'Unknown',
        run.player_display_name || run.player_username || 'Unknown',
        run.won ? 'Oui' : 'Non',
        run.run_level || 0,
        run.waves_completed || 0,
        biomesVisited,
        run.nodes_completed || 0,
        run.combats_won || 0,
        run.combats_lost || 0,
        run.elite_kills || 0,
        run.boss_kills || 0,
        run.gold_earned || 0,
        run.total_gold_spent || 0,
        run.total_kills || 0,
        run.total_damage_dealt || 0,
        run.total_damage_received || 0,
        run.total_healing_done || 0,
        run.total_healing_received || 0,
        run.candies_earned || 0,
        run.duration_seconds || '',
        run.started_at ? formatDate(run.started_at) : '',
        run.completed_at ? formatDate(run.completed_at) : '',
        run.champions_recruited || 0,
        run.items_purchased || 0,
        champions,
        championDetails,
      ]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `runs_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get log level color
  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return '#e74c3c';
      case 'warn':
        return '#f39c12';
      case 'info':
        return '#3498db';
      case 'debug':
        return '#95a5a6';
      default:
        return '#c8aa6e';
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-error">
          <h2>⛔ Accès Refusé</h2>
          <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  const handleGoHome = () => {
    navigateTo(ROUTES.MENU);
    navigate(ROUTES.MENU);
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <button className="admin-back-btn" onClick={handleGoHome} title="Retour à l'accueil">
          ← Retour
        </button>
        <h1>🛡️ Panel Admin</h1>
        <p>Bienvenue, {player?.display_name || player?.username}</p>
      </div>

      <div className="admin-nav">
        <button
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          📊 Tableau de bord
        </button>
        <button
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => setActiveTab('logs')}
        >
          📋 Logs
        </button>
        <button
          className={activeTab === 'players' ? 'active' : ''}
          onClick={() => setActiveTab('players')}
        >
          👥 Joueurs
        </button>
        <button
          className={activeTab === 'runs' ? 'active' : ''}
          onClick={() => setActiveTab('runs')}
        >
          🎮 Runs
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
                  <div className="stat-label">Total Joueurs</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.active_today || '0'}</div>
                  <div className="stat-label">Actifs Aujourd'hui</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_runs || '0'}</div>
                  <div className="stat-label">Total Runs</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_daily_runs || '0'}</div>
                  <div className="stat-label">Daily Runs</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_wins || '0'}</div>
                  <div className="stat-label">Total Victoires</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.total_candies_earned || '0'}</div>
                  <div className="stat-label">Candies Gagnés</div>
                </div>
              </div>
            )}

            <div className="admin-quick-actions">
              <h3>Actions Rapides</h3>
              <div className="action-buttons">
                <button onClick={() => setActiveTab('logs')}>Voir les Logs</button>
                <button onClick={() => setActiveTab('players')}>Gérer les Joueurs</button>
                <button onClick={fetchStats}>Rafraîchir les Stats</button>
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
                        <td>{formatDate(log.created_at)}</td>
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
                      <th>Username</th>
                      <th>Niveau</th>
                      <th>Runs</th>
                      <th>Victoires</th>
                      <th>Win Rate</th>
                      <th>Candies</th>
                      <th>Dernière Connexion</th>
                      <th>Inscrit le</th>
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
                        <td>{p.last_login_at ? formatDate(p.last_login_at) : 'Jamais'}</td>
                        <td>{formatDate(p.created_at)}</td>
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
              <h3>Historique des Runs</h3>
              <div className="runs-actions">
                <button
                  className="export-btn"
                  onClick={exportRunsToCSV}
                  disabled={runs.length === 0}
                  title="Exporter les données en CSV"
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
                    fontFamily: 'Cinzel, Georgia, serif',
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
                    fontFamily: 'Cinzel, Georgia, serif',
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
                  <option value="run_level">Niveau de run</option>
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
              <div className="loading">Chargement des runs...</div>
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
                        <th>Kills</th>
                        <th>Dégâts</th>
                        <th>Or</th>
                        <th>Candies</th>
                        <th>Durée</th>
                        <th>Équipe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className={run.won ? 'win-row' : 'loss-row'}>
                          <td>{run.completed_at ? formatDate(run.completed_at) : '-'}</td>
                          <td>
                            <div className="player-name">
                              {run.player_display_name || run.player_username || 'Unknown'}
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
                  {runs.length === 0 && <div className="no-data">Aucun run trouvé</div>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
