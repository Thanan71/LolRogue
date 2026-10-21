import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { fr, locale } from '@/i18n/fr';
import { getAdministrationCopy } from '@/i18n/administration';
import { useAuthStore } from '@/stores/authStore';
import type { AdminTab } from '../domain/adminDataContracts';
import { ADMINISTRATION_VIEWS, type AdministrationGroup } from '../domain/administrationNavigation';
import { useAdministrationNavigation } from '../hooks/useAdministrationNavigation';
import { useAdminAnalytics } from '../hooks/analytics/useAdminAnalytics';
import { useAdminPlayersExplorer } from '../hooks/players/useAdminPlayersExplorer';
import { useAdminRunExplorer } from '../hooks/runs/useAdminRunExplorer';
import { useAdminData } from '../hooks/useAdminData';
import { AdminDashboardPanel } from './AdminDashboardPanel';
import { AdminTabList, AdministrationSubTabs } from './AdminTabList';
import { AdminAnalyticsPanel } from './analytics/AdminAnalyticsPanel';
import { AdminPlayersPanel } from './players/AdminPlayersPanel';
import { AdminRunsPanel } from './runs/AdminRunsPanel';
import '@/styles/admin.css';
import '@/styles/admin-analytics.css';

const AdminBalanceWorkspace = lazy(() => import('./balance/AdminBalanceWorkspace'));
const AdminModerationWorkspace = lazy(() => import('./moderation/AdminModerationWorkspace'));
const AdminDiagnosticsWorkspace = lazy(() => import('./diagnostics/AdminDiagnosticsWorkspace'));

export function AdministrationScreen() {
  const { player, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const navigation = useAdministrationNavigation();
  const { group, view } = navigation.location;
  const copy = getAdministrationCopy(locale);
  const { stats, statsLoading, errors, sections, fetchStats } = useAdminData(
    isAdmin,
    group === 'overview' && view === 'dashboard',
  );
  const [visited, setVisited] = useState(() => new Set<AdministrationGroup>([group]));
  const selectGroup = (next: AdministrationGroup) => {
    setVisited((previous) => new Set([...previous, next]));
    navigation.select(next);
  };
  const isVisited = (value: AdministrationGroup) => visited.has(value) || group === value;
  const playersExplorer = useAdminPlayersExplorer(group === 'players', navigation);
  const runExplorer = useAdminRunExplorer(isAdmin, group === 'runs', navigation);
  const analytics = useAdminAnalytics(group === 'overview' && view === 'analytics', navigation);
  const selectLegacyAction = (tab: AdminTab) => {
    const target: AdministrationGroup =
      tab === 'dashboard' || tab === 'analytics'
        ? 'overview'
        : tab === 'logs' || tab === 'authority'
          ? 'monitoring'
          : tab;
    setVisited((previous) => new Set([...previous, target]));
    navigation.select(
      target,
      tab === 'dashboard' || tab === 'analytics' || tab === 'logs' || tab === 'authority'
        ? tab
        : undefined,
    );
  };
  if (!isAdmin)
    return (
      <main className="admin-page">
        <div className="admin-error">
          <h1>⛔ {fr.admin.accessDenied}</h1>
          <p>{fr.admin.noPermission}</p>
        </div>
      </main>
    );

  return (
    <main className="admin-page">
      <header className="admin-header">
        <button
          type="button"
          className="admin-back-btn"
          onClick={() => navigate(ROUTES.MENU)}
          title={fr.admin.home}
        >
          {fr.common.back}
        </button>
        <h1>🛡️ {fr.admin.title}</h1>
        <p>
          {fr.admin.welcome}, {player?.display_name || player?.username}
        </p>
      </header>
      <AdminTabList group={group} onSelect={selectGroup} />
      <div className="admin-content">
        <div
          role={ADMINISTRATION_VIEWS[group].length > 1 ? 'tabpanel' : undefined}
          id={`admin-group-panel-${group}`}
          aria-labelledby={
            ADMINISTRATION_VIEWS[group].length > 1 ? `admin-group-${group}` : undefined
          }
        >
          <AdministrationSubTabs
            group={group}
            view={view}
            onSelect={(next) => navigation.select(group, next)}
          />
          <p className="admin-context-notice">{copy.contextPreserved}</p>
          <div hidden={group !== 'overview' || view !== 'dashboard'}>
            <AdminDashboardPanel
              loading={statsLoading}
              state={sections.stats}
              stats={stats}
              onSelectTab={selectLegacyAction}
              onRefresh={fetchStats}
              error={errors.stats}
            />
          </div>
          <div hidden={group !== 'players'}>
            <AdminPlayersPanel
              explorer={playersExplorer}
              onOpenRuns={runExplorer.setPlayerFilter}
            />
          </div>
          <div hidden={group !== 'runs'}>
            <AdminRunsPanel explorer={runExplorer} />
          </div>
          <div hidden={group !== 'overview' || view !== 'analytics'}>
            <AdminAnalyticsPanel analytics={analytics} />
          </div>
          <div hidden={group !== 'balance'}>
            {isVisited('balance') && (
              <Suspense fallback={<p role="status">{fr.common.loading}</p>}>
                <AdminBalanceWorkspace
                  active={group === 'balance'}
                  view={view === 'calibration' ? 'calibration' : 'reports'}
                  navigation={navigation}
                />
              </Suspense>
            )}
          </div>
          <div hidden={group !== 'moderation'}>
            {isVisited('moderation') && (
              <Suspense fallback={<p role="status">{fr.common.loading}</p>}>
                <AdminModerationWorkspace active={group === 'moderation'} navigation={navigation} />
              </Suspense>
            )}
          </div>
          <div hidden={group !== 'monitoring'}>
            {isVisited('monitoring') && (
              <Suspense fallback={<p role="status">{fr.common.loading}</p>}>
                <AdminDiagnosticsWorkspace
                  active={group === 'monitoring'}
                  tab={view === 'authority' || view === 'service' ? view : 'logs'}
                  navigation={navigation}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
