import { Routes, Route } from 'react-router-dom';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';
import { RouteSync } from './components/RouteSync';
import { MenuPage } from './pages/MenuPage';
import { StarterSelectPage } from './pages/StarterSelectPage';
import { RunPage } from './pages/RunPage';
import { CombatPage } from './pages/CombatPage';
import { ShopPage } from './pages/ShopPage';
import { RestPage } from './pages/RestPage';
import { EventPage } from './pages/EventPage';
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
        <Route path="/" element={<MenuPage />} />
        <Route path="/starter-select" element={<StarterSelectPage />} />
        <Route path="/run" element={<RunPage />} />
        <Route path="/combat" element={<CombatPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/rest" element={<RestPage />} />
        <Route path="/event" element={<EventPage />} />
        <Route path="/game-over" element={<GameOverPage />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/credits" element={<CreditsPage />} />
      </Routes>
      <SpeedInsights />
      <Analytics />
    </div>
  );
}
