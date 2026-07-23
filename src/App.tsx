import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Route, Routes } from 'react-router-dom';
import { AdminRoute } from './components/AdminRoute';
import { AuthBootstrap } from './components/AuthBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteSync } from './components/RouteSync';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { CombatPage } from './pages/CombatPage';
import { CreditsPage } from './pages/CreditsPage';
import { DatabasePage } from './pages/DatabasePage';
import { DailyRunPage } from './pages/DailyRunPage';
import { EventPage } from './pages/EventPage';
import { GameOverPage } from './pages/GameOverPage';
import { MenuPage } from './pages/MenuPage';
import { RecruitPage } from './pages/RecruitPage';
import { RestPage } from './pages/RestPage';
import { RunPage } from './pages/RunPage';
import { SettingsPage } from './pages/SettingsPage';
import { ShopPage } from './pages/ShopPage';
import { StarterSelectPage } from './pages/StarterSelectPage';
import { TreasurePage } from './pages/TreasurePage';
import './styles/starter-select.css';

export default function App() {
  return (
    <div id="app">
      <RouteSync />
      <AuthBootstrap />
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
              <StarterSelectPage />
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
              <CombatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shop"
          element={
            <ProtectedRoute>
              <ShopPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recruit"
          element={
            <ProtectedRoute>
              <RecruitPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rest"
          element={
            <ProtectedRoute>
              <RestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/event"
          element={
            <ProtectedRoute>
              <EventPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/treasure"
          element={
            <ProtectedRoute>
              <TreasurePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game-over"
          element={
            <ProtectedRoute>
              <GameOverPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/daily-run"
          element={
            <ProtectedRoute>
              <DailyRunPage />
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
      </Routes>
      <SpeedInsights />
      <Analytics />
    </div>
  );
}
