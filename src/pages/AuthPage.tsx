import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { playUIClick } from '@/audio';
import { ParticleBackground } from '@/components/ParticleBackground';
import { ROUTES } from '@/config/routes';
import { finalizeActiveRunBeforeTransition } from '@/game/run/abandonment';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import '@/styles/auth.css';

type AuthMode = 'login' | 'signup';

export function AuthPage() {
  const navigate = useAppNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  const {
    isAuthenticated,
    isLoading,
    error,
    successMessage,
    login,
    signUp,
    clearError,
    clearSuccessMessage,
    enterGuestMode,
  } = useAuthStore();

  const hasRedirected = useRef(false);
  const identityTransitionRef = useRef(false);

  // Redirect if already authenticated (only once)
  useEffect(() => {
    if (isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true;
      void import('@/stores/runStore').then(({ useRunStore }) => {
        navigate(useRunStore.getState().isActive ? ROUTES.RUN : ROUTES.MENU);
      });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    clearSuccessMessage();
    playUIClick();

    if (mode === 'login') {
      const result = await login(email, password);
      if (result.success) {
        // Use React Router navigation instead of window.location
        // The ProtectedRoute will handle the redirect if needed
        const { useRunStore } = await import('@/stores/runStore');
        navigate(useRunStore.getState().isActive ? ROUTES.RUN : ROUTES.MENU);
      }
    } else {
      if (!username.trim()) {
        useAuthStore.setState({ error: "Le nom d'utilisateur est requis." });
        return;
      }
      const result = await signUp(
        email,
        password,
        username.trim(),
        displayName.trim() || undefined,
      );
      if (result.success) {
        // Use React Router navigation instead of window.location
        navigate(ROUTES.MENU);
      }
    }
  };

  const handleGuestPlay = async () => {
    if (identityTransitionRef.current) return;
    identityTransitionRef.current = true;
    playUIClick();
    try {
      const { useRunStore } = await import('@/stores/runStore');
      const runState = useRunStore.getState();
      const canContinue = await finalizeActiveRunBeforeTransition({
        isActive: runState.isActive,
        runId: runState.runId,
        confirm: (message) => window.confirm(message),
        endRun: (runId) => runState.endRun(false, runId),
      });
      if (!canContinue) return;
      const result = await enterGuestMode();
      if (result.success) navigate(ROUTES.MENU);
    } finally {
      identityTransitionRef.current = false;
    }
  };

  const isFormValid = () => {
    if (mode === 'login') {
      return email.trim() && password.trim();
    }
    return email.trim() && password.trim() && username.trim() && password.length >= 6;
  };

  return (
    <div className="auth-page">
      <ParticleBackground particleCount={60} />

      <main className="auth-page__content">
        <section className="auth-page__intro" aria-labelledby="auth-page-title">
          <div className="auth-page__logo-section">
            <span className="auth-page__icon" role="img" aria-label="Logo LoL Rogue" />
            <div className="auth-page__brand-copy">
              <span className="auth-page__eyebrow">La Faille se réinvente</span>
              <h1 id="auth-page-title" className="auth-page__title">
                LoL Rogue
              </h1>
              <p className="auth-page__subtitle">{fr.product.subtitle}</p>
            </div>
          </div>

          <div className="auth-page__intro-copy">
            <p className="auth-page__intro-kicker">Une nouvelle ascension à chaque partie</p>
            <h2>Compose ton escouade. Adapte ton build. Survis à chaque détour.</h2>
            <p>
              Retrouve la tension d’un roguelike tactique dans des runs rapides où chaque champion,
              rune et décision peut renverser le combat.
            </p>
          </div>

          <ul className="auth-page__benefits" aria-label="Points forts">
            <li>
              <span aria-hidden="true">01</span>
              <strong>Décisions tactiques</strong>
              <small>Chaque route transforme ton équipe.</small>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <strong>Progression persistante</strong>
              <small>Retrouve tes runs et ta maîtrise.</small>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <strong>Défis quotidiens</strong>
              <small>Une même graine, un nouveau classement.</small>
            </li>
          </ul>
        </section>

        <section className="auth-page__container" aria-label="Accès à LoL Rogue">
          <div className="auth-page__card-header">
            <span className="auth-page__card-kicker">Portail de jeu</span>
            <h2>{mode === 'login' ? 'Reprends ton ascension' : 'Crée ton profil de joueur'}</h2>
            <p>
              {mode === 'login'
                ? 'Connecte-toi pour retrouver ta progression.'
                : 'Enregistre tes runs et ta progression.'}
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="auth-page__error" role="alert">
              {fr.auth.unavailable}
            </div>
          )}

          <div
            className="auth-page__tabs"
            role="tablist"
            aria-label="Authentification"
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              const nextMode = mode === 'login' ? 'signup' : 'login';
              setMode(nextMode);
              window.requestAnimationFrame(() =>
                document.getElementById(`auth-tab-${nextMode}`)?.focus(),
              );
            }}
          >
            <button
              type="button"
              role="tab"
              id="auth-tab-login"
              aria-selected={mode === 'login'}
              aria-controls="auth-panel"
              tabIndex={mode === 'login' ? 0 : -1}
              className={`auth-page__tab ${mode === 'login' ? 'auth-page__tab--active' : ''}`}
              onClick={() => {
                playUIClick();
                setMode('login');
                clearError();
                clearSuccessMessage();
              }}
            >
              {fr.auth.login}
            </button>
            <button
              type="button"
              role="tab"
              id="auth-tab-signup"
              aria-selected={mode === 'signup'}
              aria-controls="auth-panel"
              tabIndex={mode === 'signup' ? 0 : -1}
              className={`auth-page__tab ${mode === 'signup' ? 'auth-page__tab--active' : ''}`}
              onClick={() => {
                playUIClick();
                setMode('signup');
                clearError();
                clearSuccessMessage();
              }}
            >
              {fr.auth.signup}
            </button>
          </div>

          {error && (
            <div className="auth-page__error" role="alert">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="auth-page__success" role="status">
              {successMessage}
            </div>
          )}

          <form
            className="auth-page__form"
            id="auth-panel"
            role="tabpanel"
            aria-labelledby={mode === 'login' ? 'auth-tab-login' : 'auth-tab-signup'}
            aria-busy={isLoading}
            onSubmit={handleSubmit}
          >
            {mode === 'signup' && (
              <>
                <div className="auth-page__form-group">
                  <label className="auth-page__label" htmlFor="username">
                    {fr.auth.username}
                  </label>
                  <input
                    id="username"
                    type="text"
                    className="auth-page__input"
                    placeholder={fr.auth.usernamePlaceholder}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    disabled={isLoading}
                  />
                </div>

                <div className="auth-page__form-group">
                  <label className="auth-page__label" htmlFor="display-name">
                    {fr.auth.displayName}
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    className="auth-page__input"
                    placeholder={fr.auth.displayNamePlaceholder}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    disabled={isLoading}
                  />
                </div>
              </>
            )}

            <div className="auth-page__form-group">
              <label className="auth-page__label" htmlFor="email">
                {fr.auth.email}
              </label>
              <input
                id="email"
                type="email"
                className="auth-page__input"
                placeholder={fr.auth.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="auth-page__form-group">
              <label className="auth-page__label" htmlFor="password">
                {fr.auth.password}
              </label>
              <input
                id="password"
                type="password"
                className="auth-page__input"
                placeholder={
                  mode === 'signup'
                    ? fr.auth.passwordSignupPlaceholder
                    : fr.auth.passwordPlaceholder
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="auth-page__submit"
              disabled={!isSupabaseConfigured || isLoading || !isFormValid()}
            >
              {isLoading ? (
                <>
                  <span className="auth-page__spinner" aria-hidden="true" />
                  {mode === 'login' ? fr.auth.loggingIn : fr.auth.creatingAccount}
                </>
              ) : mode === 'login' ? (
                fr.auth.login
              ) : (
                fr.auth.signup
              )}
            </button>
          </form>

          <div className="auth-page__guest">
            <div className="auth-page__divider" aria-hidden="true">
              <div className="auth-page__divider-line" />
              <span className="auth-page__divider-text">{fr.auth.or}</span>
              <div className="auth-page__divider-line" />
            </div>
            <p>Découvre le jeu immédiatement, sans sauvegarde en ligne.</p>
            <button type="button" className="auth-page__guest-btn" onClick={handleGuestPlay}>
              {fr.auth.guest}
            </button>
          </div>
        </section>
      </main>

      <footer className="auth-page__footer">
        <p className="auth-page__footer-text">
          En continuant, tu acceptes les{' '}
          <Link to={ROUTES.LEGAL}>conditions d’utilisation et la politique de confidentialité</Link>
          .
        </p>
      </footer>
    </div>
  );
}
