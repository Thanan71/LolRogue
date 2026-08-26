import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { RouteLoadingFallback } from './components/AppErrorBoundary';
import { AuthBootstrap } from './components/AuthBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { assertValidRuleCatalogs } from './game/rules/catalogValidation';
import { installLegacyEnglishDomTranslation } from './i18n/legacyEnglish';
import { installLegacyEnglishContentTranslation } from './i18n/legacyEnglishContent';
import { useSettingsStore } from './stores/settingsStore';
import { installGlobalErrorCapture } from './utils/observability';

assertValidRuleCatalogs();

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Menu principal',
  '/auth': 'Connexion',
  '/starter-select': 'Sélection de départ',
  '/run': 'Carte de la partie',
  '/combat': 'Combat',
  '/shop': 'Boutique',
  '/recruit': 'Recrutement',
  '/rest': 'Repos',
  '/event': 'Événement',
  '/treasure': 'Trésor',
  '/game-over': 'Résultat de la partie',
  '/daily-run': 'Défi quotidien',
  '/profile': 'Profil',
  '/database': 'Base des champions',
  '/settings': 'Réglages',
  '/credits': 'Crédits',
  '/rules': 'Guide et règles',
  '/legal': 'Informations légales et confidentialité',
  '/admin': 'Administration',
};

function RouteAccessibility() {
  const { pathname } = useLocation();
  const title = ROUTE_TITLES[pathname] ?? 'Page introuvable';

  useEffect(() => {
    document.title = `${title} — LoL Rogue`;
    const focusRoute = (candidate?: ParentNode) => {
      const target =
        candidate?.querySelector<HTMLElement>('main, h1') ??
        (candidate instanceof HTMLElement && candidate.matches('main, h1') ? candidate : null) ??
        document.querySelector<HTMLElement>('main, h1');
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(() => focusRoute());
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('main, h1') || node.querySelector('main, h1')) {
            focusRoute(node);
            return;
          }
        }
      }
    });
    observer.observe(document.getElementById('app') ?? document.body, {
      childList: true,
      subtree: true,
    });
    // Les chunks de route peuvent dépasser une seconde sur appareil lent ou cache froid.
    const observerTimeout = window.setTimeout(() => observer.disconnect(), 5_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(observerTimeout);
      observer.disconnect();
    };
  }, [pathname, title]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {title}
    </div>
  );
}

const AdminPage = lazy(() =>
  import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const EncounterRoute = lazy(() =>
  import('./components/EncounterRoute').then((module) => ({ default: module.EncounterRoute })),
);
const NotificationRegion = lazy(() =>
  import('./components/NotificationRegion').then((module) => ({
    default: module.NotificationRegion,
  })),
);
const RunLifecycleRoute = lazy(() =>
  import('./components/RunLifecycleRoute').then((module) => ({
    default: module.RunLifecycleRoute,
  })),
);
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })),
);
const CombatPage = lazy(() =>
  import('./pages/CombatPage').then((module) => ({ default: module.CombatPage })),
);
const CreditsPage = lazy(() =>
  import('./pages/CreditsPage').then((module) => ({ default: module.CreditsPage })),
);
const DatabasePage = lazy(() =>
  import('./pages/DatabasePage').then((module) => ({ default: module.DatabasePage })),
);
const DailyRunPage = lazy(() =>
  import('./pages/DailyRunPage').then((module) => ({ default: module.DailyRunPage })),
);
const EventPage = lazy(() =>
  import('./pages/EventPage').then((module) => ({ default: module.EventPage })),
);
const GameOverPage = lazy(() =>
  import('./pages/GameOverPage').then((module) => ({ default: module.GameOverPage })),
);
const MenuPage = lazy(() =>
  import('./pages/MenuPage').then((module) => ({ default: module.MenuPage })),
);
const LegalPage = lazy(() =>
  import('./pages/LegalPage').then((module) => ({ default: module.LegalPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const RecruitPage = lazy(() =>
  import('./pages/RecruitPage').then((module) => ({ default: module.RecruitPage })),
);
const RulesPage = lazy(() =>
  import('./pages/RulesPage').then((module) => ({ default: module.RulesPage })),
);
const RestPage = lazy(() =>
  import('./pages/RestPage').then((module) => ({ default: module.RestPage })),
);
const RunPage = lazy(() =>
  import('./pages/RunPage').then((module) => ({ default: module.RunPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const ShopPage = lazy(() =>
  import('./pages/ShopPage').then((module) => ({ default: module.ShopPage })),
);
const StarterSelectPage = lazy(() =>
  import('./pages/StarterSelectPage').then((module) => ({ default: module.StarterSelectPage })),
);
const TreasurePage = lazy(() =>
  import('./pages/TreasurePage').then((module) => ({ default: module.TreasurePage })),
);

export default function App() {
  const { pathname } = useLocation();
  const textSize = useSettingsStore((state) => state.textSize);
  const shouldLoadRunNotifications = pathname !== '/auth' && pathname !== '/legal';

  useEffect(() => {
    return installGlobalErrorCapture();
  }, []);

  useEffect(() => {
    const uninstallContentTranslation = installLegacyEnglishContentTranslation();
    const uninstallLegacyTranslation = installLegacyEnglishDomTranslation();
    return () => {
      uninstallLegacyTranslation();
      uninstallContentTranslation();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    return () => {
      delete document.documentElement.dataset.textSize;
    };
  }, [textSize]);

  return (
    <div id="app">
      <RouteAccessibility />
      <AuthBootstrap />
      {shouldLoadRunNotifications ? (
        <Suspense fallback={null}>
          <NotificationRegion />
        </Suspense>
      ) : null}
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/legal" element={<LegalPage />} />
          {/* Auth page - accessible without authentication */}
          <Route
            path="/auth"
            element={
              <ProtectedRoute allowGuest={true}>
                <AuthPage />
              </ProtectedRoute>
            }
          />

          {/* All other routes require authentication (or guest mode) */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MenuPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/starter-select"
            element={
              <ProtectedRoute>
                <RunLifecycleRoute intent="start">
                  <StarterSelectPage />
                </RunLifecycleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/run"
            element={
              <ProtectedRoute>
                <RunPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/combat"
            element={
              <ProtectedRoute>
                <EncounterRoute expectedTypes={['combat', 'elite', 'boss']}>
                  <CombatPage />
                </EncounterRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/shop"
            element={
              <ProtectedRoute>
                <EncounterRoute expectedTypes={['shop']}>
                  <ShopPage />
                </EncounterRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/recruit"
            element={
              <ProtectedRoute>
                <EncounterRoute expectedTypes={['recruit']}>
                  <RecruitPage />
                </EncounterRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/rest"
            element={
              <ProtectedRoute>
                <EncounterRoute expectedTypes={['rest']}>
                  <RestPage />
                </EncounterRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/event"
            element={
              <ProtectedRoute>
                <EncounterRoute expectedTypes={['event']}>
                  <EventPage />
                </EncounterRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/treasure"
            element={
              <ProtectedRoute>
                <EncounterRoute expectedTypes={['treasure']}>
                  <TreasurePage />
                </EncounterRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/game-over"
            element={
              <ProtectedRoute>
                <RunLifecycleRoute intent="game-over">
                  <GameOverPage />
                </RunLifecycleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/daily-run"
            element={
              <ProtectedRoute>
                <RunLifecycleRoute intent="daily">
                  <DailyRunPage />
                </RunLifecycleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/database"
            element={
              <ProtectedRoute>
                <DatabasePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/credits"
            element={
              <ProtectedRoute>
                <CreditsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rules"
            element={
              <ProtectedRoute>
                <RulesPage />
              </ProtectedRoute>
            }
          />

          {/* Admin page - requires admin privileges */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPage />
              </AdminRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}
