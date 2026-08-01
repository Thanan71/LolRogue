import { useRef, useState } from 'react';
import { ParticleBackground } from '@/components/ParticleBackground';
import { ROUTES } from '@/config/routes';
import { finalizeActiveRunBeforeTransition } from '@/game/run/abandonment';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { plural } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import '@/styles/main-menu.css';
import { playUIClick } from '@/audio';

/* Inline SVG for the LoLRogue icon (shield + crossed swords motif) */
function LolRogueIcon() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="main-menu__icon"
      role="img"
      aria-labelledby="menu-logo-title"
    >
      <title id="menu-logo-title">Logo LoL Rogue</title>
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
      <line
        x1="35"
        y1="30"
        x2="65"
        y2="72"
        stroke="#D4BC8A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="65"
        y1="72"
        x2="67"
        y2="74"
        stroke="#D4BC8A"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Sword 2 - other diagonal */}
      <line
        x1="65"
        y1="30"
        x2="35"
        y2="72"
        stroke="#D4BC8A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="35"
        y1="72"
        x2="33"
        y2="74"
        stroke="#D4BC8A"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Center gem */}
      <circle cx="50" cy="50" r="5" fill="#C8AA6E" />
      <circle cx="50" cy="50" r="3" fill="#FFD700" opacity="0.6" />
    </svg>
  );
}

export function MenuPage() {
  const navigate = useAppNavigate();
  const isActive = useRunStore((s) => s.isActive);
  const runLevel = useRunStore((s) => s.runLevel);
  const currentBiome = useRunStore((s) => s.currentBiome);
  const team = useRunStore((s) => s.team);
  const endRun = useRunStore((s) => s.endRun);
  const { user, player, logout, isGuest, exitGuestMode } = useAuthStore();
  const transitionRef = useRef(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  function handleContinue() {
    playUIClick();
    navigate(ROUTES.RUN);
  }

  async function runTransition(transition: () => void | Promise<void>) {
    if (transitionRef.current) return;
    transitionRef.current = true;
    setIsTransitioning(true);
    try {
      const state = useRunStore.getState();
      const canContinue = await finalizeActiveRunBeforeTransition({
        isActive: state.isActive,
        runId: state.runId,
        confirm: (message) => window.confirm(message),
        endRun: (runId) => endRun(false, runId),
      });
      if (canContinue) await transition();
    } finally {
      transitionRef.current = false;
      setIsTransitioning(false);
    }
  }

  async function handleNewRun() {
    playUIClick();
    await runTransition(() => navigate(ROUTES.STARTER_SELECT));
  }

  async function handleLogout() {
    playUIClick();
    await runTransition(async () => {
      const result = await logout();
      if (result.success) navigate(ROUTES.AUTH);
    });
  }

  async function handleGuestLogin() {
    playUIClick();
    await runTransition(async () => {
      const result = await exitGuestMode();
      if (result.success) navigate(ROUTES.AUTH);
    });
  }

  async function handleDailyRun() {
    playUIClick();
    const state = useRunStore.getState();
    if (state.isActive && state.mode === 'daily') {
      navigate(ROUTES.RUN);
      return;
    }
    await runTransition(() => navigate(ROUTES.DAILY_RUN));
  }

  const displayName = player?.display_name || user?.email?.split('@')[0] || fr.menu.playerFallback;
  return (
    <div className="main-menu">
      <ParticleBackground particleCount={80} />

      <main className="main-menu__content">
        <div className="main-menu__logo-section">
          <LolRogueIcon />
          <h1 className="main-menu__title">LoL Rogue</h1>
          <p className="main-menu__subtitle">{fr.product.subtitle}</p>
        </div>

        {/* User Info */}
        {!isGuest && player && (
          <div className="main-menu__user-info">
            <div className="main-menu__user-avatar">
              {player.avatar_url ? (
                <img
                  src={player.avatar_url}
                  alt={displayName}
                  width={48}
                  height={48}
                  decoding="async"
                />
              ) : (
                <span>{displayName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="main-menu__user-details">
              <span className="main-menu__user-name">{displayName}</span>
              <span className="main-menu__user-level">
                {fr.common.level} {player.level}
              </span>
            </div>
          </div>
        )}

        {isGuest && (
          <div className="main-menu__guest-badge">
            <span>
              {fr.menu.guestMode} — sauvegarde locale uniquement, sans progression authentifiée
            </span>
          </div>
        )}

        <section className="main-menu__onboarding" aria-label="Boucle de jeu">
          <strong>Première partie ?</strong>
          <span>
            Choisir → avancer → résoudre → améliorer → combattre → terminer et sauvegarder.
          </span>
          <button type="button" onClick={() => navigate(ROUTES.RULES)}>
            Comprendre les règles
          </button>
        </section>

        <div className="main-menu__divider" />

        <div className="main-menu__buttons">
          {isActive && (
            <button className="main-menu__btn main-menu__btn--continue" onClick={handleContinue}>
              <span className="main-menu__btn-icon" aria-hidden="true">
                ▶
              </span>
              {fr.menu.continueRun}
              <span className="main-menu__btn-info">
                Lv.{runLevel} · {currentBiome ? currentBiome.replace('_', ' ') : '???'} ·{' '}
                {plural(team.length, 'champion')}
              </span>
            </button>
          )}

          <button
            className={`main-menu__btn ${isActive ? 'main-menu__btn--new' : 'main-menu__btn--play'}`}
            onClick={handleNewRun}
            disabled={isTransitioning}
          >
            <span className="main-menu__btn-icon" aria-hidden="true">
              ⚔
            </span>
            {isActive ? fr.menu.abandonAndNew : fr.menu.newRun}
          </button>

          <button
            className="main-menu__btn main-menu__btn--daily"
            onClick={handleDailyRun}
            disabled={isTransitioning}
          >
            <span className="main-menu__btn-icon" aria-hidden="true">
              ☀
            </span>
            {fr.menu.dailyRun}
          </button>

          <button
            className="main-menu__btn main-menu__btn--database"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.DATABASE);
            }}
          >
            {fr.menu.database}
          </button>

          <button
            className="main-menu__btn main-menu__btn--ghost"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.RULES);
            }}
          >
            Guide et règles
          </button>

          <button
            className="main-menu__btn main-menu__btn--ghost"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.PROFILE);
            }}
          >
            {fr.menu.profile}
          </button>

          <button
            className="main-menu__btn main-menu__btn--ghost"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.SETTINGS);
            }}
          >
            {fr.menu.settings}
          </button>

          <button
            className="main-menu__btn main-menu__btn--ghost"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.CREDITS);
            }}
          >
            {fr.menu.credits}
          </button>

          {player?.is_admin && (
            <button
              className="main-menu__btn main-menu__btn--admin"
              onClick={() => {
                playUIClick();
                navigate(ROUTES.ADMIN);
              }}
            >
              🛡️ {fr.menu.admin}
            </button>
          )}

          {!isGuest && (
            <button
              className="main-menu__btn main-menu__btn--logout"
              onClick={handleLogout}
              disabled={isTransitioning}
            >
              {fr.menu.logout}
            </button>
          )}

          {isGuest && (
            <button
              className="main-menu__btn main-menu__btn--logout"
              onClick={handleGuestLogin}
              disabled={isTransitioning}
            >
              {fr.menu.loginOrSignup}
            </button>
          )}
        </div>
      </main>

      <footer className="main-menu__footer">
        <div className="main-menu__version">v0.1.0</div>
        <div className="main-menu__disclaimer">{fr.product.disclaimer}</div>
      </footer>
    </div>
  );
}
