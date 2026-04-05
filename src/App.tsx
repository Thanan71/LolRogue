import { Routes, Route } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { RouteSync } from './components/RouteSync';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { MenuPage } from './pages/MenuPage';
import { StarterSelectPage } from './pages/StarterSelectPage';
import { RunPage } from './pages/RunPage';
import { CombatPage } from './pages/CombatPage';
import { ShopPage } from './pages/ShopPage';
import { RecruitPage } from './pages/RecruitPage';
import { RestPage } from './pages/RestPage';
import { EventPage } from './pages/EventPage';
import { TreasurePage } from './pages/TreasurePage';
import { GameOverPage } from './pages/GameOverPage';
import { DatabasePage } from './pages/DatabasePage';
import { SettingsPage } from './pages/SettingsPage';
import { CreditsPage } from './pages/CreditsPage';
import './styles/starter-select.css';

export default function App() {
  return (
    <div id="app">
      <RouteSync />
      <Routes>
        {/* Auth page - accessible without authentication */}
        <Route path="/auth" element={
          <ProtectedRoute allowGuest={true}>
            <AuthPage />
          </ProtectedRoute>
        } />
        
        {/* All other routes require authentication (or guest mode) */}
        <Route path="/" element={
          <ProtectedRoute>
            <MenuPage />
          </ProtectedRoute>
        } />
        <Route path="/starter-select" element={
          <ProtectedRoute>
            <StarterSelectPage />
          </ProtectedRoute>
        } />
        <Route path="/run" element={
          <ProtectedRoute>
            <RunPage />
          </ProtectedRoute>
        } />
        <Route path="/combat" element={
          <ProtectedRoute>
            <CombatPage />
          </ProtectedRoute>
        } />
        <Route path="/shop" element={
          <ProtectedRoute>
            <ShopPage />
          </ProtectedRoute>
        } />
        <Route path="/recruit" element={
          <ProtectedRoute>
            <RecruitPage />
          </ProtectedRoute>
        } />
        <Route path="/rest" element={
          <ProtectedRoute>
            <RestPage />
          </ProtectedRoute>
        } />
        <Route path="/event" element={
          <ProtectedRoute>
            <EventPage />
          </ProtectedRoute>
        } />
        <Route path="/treasure" element={
          <ProtectedRoute>
            <TreasurePage />
          </ProtectedRoute>
        } />
        <Route path="/game-over" element={
          <ProtectedRoute>
            <GameOverPage />
          </ProtectedRoute>
        } />
        <Route path="/database" element={
          <ProtectedRoute>
            <DatabasePage />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />
        <Route path="/credits" element={
          <ProtectedRoute>
            <CreditsPage />
          </ProtectedRoute>
        } />
      </Routes>
      <SpeedInsights />
      <Analytics />
    </div>
  );
}
