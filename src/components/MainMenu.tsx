import { useGameStore } from '@/stores/gameStore';
import { useRunStore } from '@/stores/runStore';

export function MainMenu() {
  const setPhase = useGameStore((s) => s.setPhase);
  const isActive = useRunStore((s) => s.isActive);
  const runLevel = useRunStore((s) => s.runLevel);
  const currentBiome = useRunStore((s) => s.currentBiome);
  const team = useRunStore((s) => s.team);
  const endRun = useRunStore((s) => s.endRun);

  function handleContinue() {
    setPhase('run');
  }

  function handleNewRun() {
    endRun();
    setPhase('starterSelect');
  }

  return (
    <div className="main-menu">
      <div className="main-menu__logo">
        <span className="main-menu__logo-icon">⚔️</span>
        <h1 className="main-menu__title">LolRogue</h1>
        <p className="main-menu__tagline">A League of Legends Roguelike</p>
      </div>

      <div className="main-menu__actions">
        {isActive && (
          <button className="main-menu__btn main-menu__btn--continue" onClick={handleContinue}>
            <span className="main-menu__btn-icon">▶</span>
            Continue Run
            <span className="main-menu__btn-info">
              Lv.{runLevel} · {currentBiome ? currentBiome.replace('_', ' ') : '???'} · {team.length} champ{team.length !== 1 ? 's' : ''}
            </span>
          </button>
        )}

        <button className="main-menu__btn main-menu__btn--new" onClick={handleNewRun}>
          <span className="main-menu__btn-icon">⚔</span>
          {isActive ? 'Abandon & New Run' : 'New Run'}
        </button>
      </div>
    </div>
  );
}
