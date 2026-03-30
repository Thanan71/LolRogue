import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { ParticleBackground } from '@/components/ParticleBackground';
import '@/styles/main-menu.css';
import { playUIClick } from '@/audio';

/* Inline SVG for the LoLRogue icon (shield + crossed swords motif) */
function LolRogueIcon() {
  return (
    <svg viewBox="0 0 100 100" className="main-menu__icon" aria-label="LoLRogue logo">
      {/* Shield body */}
      <path
        d="M50 8 L85 25 L85 55 Q85 80 50 95 Q15 80 15 55 L15 25 Z"
        fill="none"
        stroke="#C8AA6E"
        strokeWidth="3"
      />
      {/* Inner shield */}
      <path
        d="M50 16 L78 30 L78 53 Q78 74 50 87 Q22 74 22 53 L22 30 Z"
        fill="rgba(200,170,110,0.08)"
        stroke="#C8AA6E"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Sword 1 - diagonal */}
      <line x1="35" y1="30" x2="65" y2="72" stroke="#D4BC8A" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="65" y1="72" x2="67" y2="74" stroke="#D4BC8A" strokeWidth="4" strokeLinecap="round" />
      {/* Sword 2 - other diagonal */}
      <line x1="65" y1="30" x2="35" y2="72" stroke="#D4BC8A" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="35" y1="72" x2="33" y2="74" stroke="#D4BC8A" strokeWidth="4" strokeLinecap="round" />
      {/* Center gem */}
      <circle cx="50" cy="50" r="5" fill="#C8AA6E" />
      <circle cx="50" cy="50" r="3" fill="#FFD700" opacity="0.6" />
    </svg>
  );
}

export function MenuPage() {
  const navigate = useAppNavigate();

  return (
    <div className="main-menu">
      <ParticleBackground particleCount={80} />

      <div className="main-menu__logo-section">
        <LolRogueIcon />
        <h1 className="main-menu__title">LoL Rogue</h1>
        <p className="main-menu__subtitle">A League of Legends Roguelike</p>
      </div>

      <div className="main-menu__divider" />

      <div className="main-menu__buttons">
        <button
          className="main-menu__btn main-menu__btn--play"
          onClick={() => { playUIClick(); navigate(ROUTES.STARTER_SELECT); }}
        >
          Play
        </button>

        <button
          className="main-menu__btn main-menu__btn--database"
          onClick={() => { playUIClick(); navigate(ROUTES.DATABASE); }}
        >
          Database
        </button>

        <button
          className="main-menu__btn main-menu__btn--ghost"
          onClick={() => { playUIClick(); navigate(ROUTES.SETTINGS); }}
        >
          Settings
        </button>

        <button
          className="main-menu__btn main-menu__btn--ghost"
          onClick={() => { playUIClick(); navigate(ROUTES.CREDITS); }}
        >
          Credits
        </button>
      </div>

      <div className="main-menu__footer">
        <div className="main-menu__version">v0.1.0</div>
        <div className="main-menu__disclaimer">
          Fan project — not affiliated with Riot Games
        </div>
      </div>
    </div>
  );
}
