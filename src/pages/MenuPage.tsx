import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
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

      <main className="main-menu__content" aria-labelledby="main-menu-title">
        <header className="main-menu__topbar">
          <div className="main-menu__logo-section">
            <span className="main-menu__brand-mark" aria-hidden="true">
              <span>LR</span>
            </span>
            <div className="main-menu__brand-copy">
              <h1 className="main-menu__title" id="main-menu-title">
                LoL Rogue
              </h1>
              <p className="main-menu__subtitle">{fr.product.subtitle}</p>
            </div>
          </div>

          {!isGuest && (
            <div className="main-menu__user-info">
              <div className="main-menu__user-avatar" aria-hidden="true">
                {player?.avatar_url ? (
                  <img src={player.avatar_url} alt="" width={48} height={48} decoding="async" />
                ) : (
                  <span>{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="main-menu__user-details">
                <span className="main-menu__user-name">{displayName}</span>
                <span className="main-menu__user-level">
                  {player ? `${fr.common.level} ${player.level}` : 'Compte connecté'}
                </span>
              </div>
              <span className="main-menu__connection-dot" aria-hidden="true" />
            </div>
          )}

          {isGuest && (
            <div className="main-menu__guest-badge">
              <span className="main-menu__connection-dot" aria-hidden="true" />
              <span>
                <strong>{fr.menu.guestMode}</strong>
                <small>Sauvegarde locale uniquement</small>
              </span>
            </div>
          )}
        </header>

        <div className="main-menu__dashboard">
          <section className="main-menu__command" aria-labelledby="expedition-title">
            <div className="main-menu__section-heading">
              <span className="main-menu__eyebrow">Centre de commandement</span>
              <h2 id="expedition-title">
                {isActive ? 'Votre expédition vous attend' : 'Préparez votre prochaine ascension'}
              </h2>
              <p>
                {isActive
                  ? 'Reprenez la route ou engagez une nouvelle équipe.'
                  : 'Composez votre équipe et traversez les six biomes de la Faille.'}
              </p>
            </div>

            {isActive && (
              <div className="main-menu__run-status" role="status" aria-label="Partie en cours">
                <span className="main-menu__run-pulse" aria-hidden="true" />
                <span className="main-menu__run-label">Partie en cours</span>
                <span className="main-menu__run-meta">
                  {fr.common.level} {runLevel}
                  <span aria-hidden="true">•</span>
                  <span className="main-menu__biome">
                    {currentBiome ? currentBiome.replace(/_/g, ' ') : 'Biome inconnu'}
                  </span>
                  <span aria-hidden="true">•</span>
                  {plural(team.length, 'champion')}
                </span>
              </div>
            )}

            <div className={`main-menu__primary-actions${isActive ? ' is-active' : ''}`}>
              {isActive && (
                <button
                  type="button"
                  className="main-menu__btn main-menu__btn--continue"
                  onClick={handleContinue}
                  aria-label={fr.menu.continueRun}
                >
                  <span className="main-menu__btn-icon" aria-hidden="true">
                    ▶
                  </span>
                  <span>{fr.menu.continueRun}</span>
                </button>
              )}

              <button
                type="button"
                className={`main-menu__btn ${isActive ? 'main-menu__btn--new' : 'main-menu__btn--play'}`}
                onClick={handleNewRun}
                disabled={isTransitioning}
                aria-label={isActive ? fr.menu.abandonAndNew : fr.menu.newRun}
              >
                <span className="main-menu__btn-icon" aria-hidden="true">
                  ◆
                </span>
                <span>{isActive ? fr.menu.abandonAndNew : fr.menu.newRun}</span>
              </button>

              <button
                type="button"
                className="main-menu__btn main-menu__btn--daily"
                onClick={handleDailyRun}
                disabled={isTransitioning}
                aria-label={fr.menu.dailyRun}
              >
                <span className="main-menu__btn-icon" aria-hidden="true">
                  ✦
                </span>
                <span>{fr.menu.dailyRun}</span>
              </button>
            </div>
          </section>

          <section className="main-menu__onboarding" aria-label="Boucle de jeu">
            <div className="main-menu__onboarding-mark" aria-hidden="true">
              01
            </div>
            <div className="main-menu__onboarding-copy">
              <strong>Première partie ?</strong>
              <span>
                Choisir → avancer → résoudre → améliorer → combattre → terminer et sauvegarder.
              </span>
            </div>
            <button type="button" onClick={() => navigate(ROUTES.RULES)}>
              Comprendre les règles
            </button>
          </section>
        </div>

        <nav className="main-menu__navigation" aria-label="Navigation principale">
          <div className="main-menu__section-heading main-menu__section-heading--compact">
            <span className="main-menu__eyebrow">Quartier général</span>
            <h2>Préparer la partie</h2>
          </div>

          <div className="main-menu__nav-grid">
            <button
              type="button"
              className="main-menu__nav-card"
              aria-label={fr.menu.database}
              onClick={() => {
                playUIClick();
                navigate(ROUTES.DATABASE);
              }}
            >
              <span className="main-menu__nav-icon" aria-hidden="true">
                ◇
              </span>
              <span className="main-menu__nav-copy">
                <strong>{fr.menu.database}</strong>
                <small>Catalogue et maîtrises</small>
              </span>
              <span className="main-menu__nav-arrow" aria-hidden="true">
                →
              </span>
            </button>

            <button
              type="button"
              className="main-menu__nav-card"
              aria-label="Guide et règles"
              onClick={() => {
                playUIClick();
                navigate(ROUTES.RULES);
              }}
            >
              <span className="main-menu__nav-icon" aria-hidden="true">
                ⌁
              </span>
              <span className="main-menu__nav-copy">
                <strong>Guide et règles</strong>
                <small>Mécaniques de la Faille</small>
              </span>
              <span className="main-menu__nav-arrow" aria-hidden="true">
                →
              </span>
            </button>

            <button
              type="button"
              className="main-menu__nav-card"
              aria-label={fr.menu.profile}
              onClick={() => {
                playUIClick();
                navigate(ROUTES.PROFILE);
              }}
            >
              <span className="main-menu__nav-icon" aria-hidden="true">
                ◎
              </span>
              <span className="main-menu__nav-copy">
                <strong>{fr.menu.profile}</strong>
                <small>Résultats et progression</small>
              </span>
              <span className="main-menu__nav-arrow" aria-hidden="true">
                →
              </span>
            </button>

            <button
              type="button"
              className="main-menu__nav-card"
              aria-label={fr.menu.settings}
              onClick={() => {
                playUIClick();
                navigate(ROUTES.SETTINGS);
              }}
            >
              <span className="main-menu__nav-icon" aria-hidden="true">
                ⊹
              </span>
              <span className="main-menu__nav-copy">
                <strong>{fr.menu.settings}</strong>
                <small>Audio, confort et affichage</small>
              </span>
              <span className="main-menu__nav-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </nav>

        <div className="main-menu__utility" role="group" aria-label="Liens du compte">
          <button
            type="button"
            className="main-menu__utility-btn"
            aria-label={fr.menu.credits}
            onClick={() => {
              playUIClick();
              navigate(ROUTES.CREDITS);
            }}
          >
            {fr.menu.credits}
          </button>

          {player?.is_admin && (
            <button
              type="button"
              className="main-menu__utility-btn main-menu__utility-btn--admin"
              aria-label={fr.menu.admin}
              onClick={() => {
                playUIClick();
                navigate(ROUTES.ADMIN);
              }}
            >
              <span aria-hidden="true">◆</span> {fr.menu.admin}
            </button>
          )}

          {!isGuest && (
            <button
              type="button"
              className="main-menu__utility-btn main-menu__utility-btn--account"
              onClick={handleLogout}
              disabled={isTransitioning}
              aria-label={fr.menu.logout}
            >
              {fr.menu.logout}
            </button>
          )}

          {isGuest && (
            <button
              type="button"
              className="main-menu__utility-btn main-menu__utility-btn--account"
              onClick={handleGuestLogin}
              disabled={isTransitioning}
              aria-label={fr.menu.loginOrSignup}
            >
              {fr.menu.loginOrSignup}
            </button>
          )}
        </div>
      </main>

      <footer className="main-menu__footer">
        <span className="main-menu__version">v0.1.0</span>
        <span className="main-menu__disclaimer">{fr.product.disclaimer}</span>
        <Link to={ROUTES.LEGAL}>Légal et confidentialité</Link>
      </footer>
    </div>
  );
}
