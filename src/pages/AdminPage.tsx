import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { AdminDashboardPanel } from './admin/AdminDashboardPanel';
import { AdminTabList } from './admin/AdminTabList';
import { AdminAnalyticsPanel } from './admin/analytics/AdminAnalyticsPanel';
import { useAdminAnalytics } from './admin/analytics/useAdminAnalytics';
import { AdminPlayersPanel } from './admin/players/AdminPlayersPanel';
import { useAdminPlayersExplorer } from './admin/players/useAdminPlayersExplorer';
import { AdminRunsPanel } from './admin/runs/AdminRunsPanel';
import { useAdminRunExplorer } from './admin/runs/useAdminRunExplorer';
import { useAdminData } from './admin/useAdminData';
import '@/styles/admin.css';
import '@/styles/admin-analytics.css';

const AdminBalanceWorkspace = lazy(() => import('./admin/balance/AdminBalanceWorkspace'));
const AdminModerationWorkspace = lazy(() => import('./admin/moderation/AdminModerationWorkspace'));

const AdminDiagnosticsWorkspace = lazy(
  () => import('./admin/diagnostics/AdminDiagnosticsWorkspace'),
);

export function AdminPage() {
  const { player, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const { activeTab, setActiveTab, stats, statsLoading, errors, sections, fetchStats } =
    useAdminData(isAdmin);
  const [balanceVisited, setBalanceVisited] = useState(false);
  const [moderationVisited, setModerationVisited] = useState(false);
  const [diagnosticsVisited, setDiagnosticsVisited] = useState(false);
  const selectTab = (tab: Parameters<typeof setActiveTab>[0]) => {
    if (tab === 'balance') setBalanceVisited(true);
    if (tab === 'moderation') setModerationVisited(true);
    if (tab === 'logs' || tab === 'authority') setDiagnosticsVisited(true);
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

        <div hidden={activeTab !== 'logs' && activeTab !== 'authority'}>
          {diagnosticsVisited && (
            <Suspense fallback={<p role="status">{fr.common.loading}</p>}>
              <AdminDiagnosticsWorkspace
                active={activeTab === 'logs' || activeTab === 'authority'}
                tab={activeTab === 'logs' ? 'logs' : 'authority'}
              />
            </Suspense>
          )}
        </div>

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

        <div hidden={activeTab !== 'moderation'}>
          {moderationVisited && (
            <Suspense fallback={<p role="status">{fr.common.loading}</p>}>
              <AdminModerationWorkspace active={activeTab === 'moderation'} />
            </Suspense>
          )}
        </div>
      </div>
    </main>
  );
}
