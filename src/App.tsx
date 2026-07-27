import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { AuthBootstrap } from './components/AuthBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteLoadingFallback } from './components/AppErrorBoundary';
import { RunLifecycleRoute } from './components/RunLifecycleRoute';
import { getTextSizeMultiplier, useSettingsStore } from './stores/settingsStore';
import { assertValidRuleCatalogs } from './game/rules/catalogValidation';
import './styles/starter-select.css';

assertValidRuleCatalogs();

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
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const RecruitPage = lazy(() =>
  import('./pages/RecruitPage').then((module) => ({ default: module.RecruitPage })),
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
  const textSize = useSettingsStore((state) => state.textSize);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * getTextSizeMultiplier(textSize)}px`;
    return () => {
      document.documentElement.style.removeProperty('font-size');
    };
  }, [textSize]);

  return (
    <div id="app">
      <AuthBootstrap />
      <Suspense fallback={null}>
        <NotificationRegion />
      </Suspense>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
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
