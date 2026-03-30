import { Routes, Route } from 'react-router-dom';
import { RouteSync } from './components/RouteSync';
import { MenuPage } from './pages/MenuPage';
import { StarterSelectPage } from './pages/StarterSelectPage';
import { RunPage } from './pages/RunPage';
import { CombatPage } from './pages/CombatPage';
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
        <Route path="/game-over" element={<GameOverPage />} />
        <Route path="/database" element={<DatabasePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/credits" element={<CreditsPage />} />
      </Routes>
    </div>
  );
}
