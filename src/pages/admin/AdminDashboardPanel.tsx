import { fr } from '@/i18n/fr';
import type { AdminTab } from './useAdminData';

interface AdminDashboardPanelProps {
  loading: boolean;
  stats: Record<string, string>;
  onSelectTab: (tab: AdminTab) => void;
  onRefresh: () => void;
}

const DASHBOARD_STATS = [
  ['total_players', fr.admin.totalPlayers],
  ['active_today', fr.admin.activeToday],
  ['total_runs', fr.admin.totalRuns],
  ['total_daily_runs', fr.admin.dailyRuns],
  ['total_wins', fr.admin.totalWins],
  ['total_candies_earned', fr.admin.candiesEarned],
] as const;

export function AdminDashboardPanel({
  loading,
  stats,
  onSelectTab,
  onRefresh,
}: AdminDashboardPanelProps) {
  return (
    <section className="dashboard-tab" aria-label={fr.admin.dashboard}>
      {loading ? (
        <div className="loading">Chargement...</div>
      ) : (
        <div className="stats-grid">
          {DASHBOARD_STATS.map(([key, label]) => (
            <div className="stat-card" key={key}>
              <div className="stat-value">{stats[key] || '0'}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="admin-quick-actions">
        <h3>{fr.admin.quickActions}</h3>
        <div className="action-buttons">
          <button onClick={() => onSelectTab('logs')}>{fr.admin.viewLogs}</button>
          <button onClick={() => onSelectTab('players')}>{fr.admin.managePlayers}</button>
          <button onClick={onRefresh}>{fr.admin.refreshStats}</button>
        </div>
      </div>
    </section>
  );
}
