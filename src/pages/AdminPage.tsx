import { useState, useEffect } from 'react';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useRouterStore, ROUTES } from '@/stores/routerStore';
import { useNavigate } from 'react-router-dom';
import type { AdminStat, AdminPlayerStat, Log } from '@/types/database';
import '@/styles/admin.css';

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
      const { data, error } = await supabase
        .from('admin_stats')
        .select('*');
      
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
      }
    }
  }, [activeTab, logFilter]);

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
      case 'error': return '#e74c3c';
      case 'warn': return '#f39c12';
      case 'info': return '#3498db';
      case 'debug': return '#95a5a6';
      default: return '#c8aa6e';
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
                <button onClick={() => setActiveTab('logs')}>
                  Voir les Logs
                </button>
                <button onClick={() => setActiveTab('players')}>
                  Gérer les Joueurs
                </button>
                <button onClick={fetchStats}>
                  Rafraîchir les Stats
                </button>
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
                  onChange={(e) => setLogFilter({...logFilter, level: e.target.value})}
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
                  onChange={(e) => setLogFilter({...logFilter, operation: e.target.value})}
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
                  onChange={(e) => setLogFilter({...logFilter, limit: parseInt(e.target.value)})}
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
                        <td title={log.error_stack || ''}>
                          {log.error_message ? '❌' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {logs.length === 0 && (
                  <div className="no-data">Aucun log trouvé</div>
                )}
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
                {playerStats.length === 0 && (
                  <div className="no-data">Aucun joueur trouvé</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'runs' && (
          <div className="runs-tab">
            <h3>Historique des Runs</h3>
            <p className="coming-soon">Fonctionnalité à venir...</p>
          </div>
        )}
      </div>
    </div>
  );
}