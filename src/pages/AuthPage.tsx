import { useEffect, useRef, useState } from 'react';
import { playUIClick } from '@/audio';
import { ParticleBackground } from '@/components/ParticleBackground';
import { ROUTES } from '@/config/routes';
import { finalizeActiveRunBeforeTransition } from '@/game/run/abandonment';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import '@/styles/auth.css';

type AuthMode = 'login' | 'signup';

/* Inline SVG for the LoLRogue icon */
function LolRogueIconSmall() {
  return (
    <svg viewBox="0 0 100 100" className="auth-page__icon" aria-label="LoLRogue logo">
      <path
        d="M50 8 L85 25 L85 55 Q85 80 50 95 Q15 80 15 55 L15 25 Z"
        fill="none"
        stroke="#C8AA6E"
        strokeWidth="3"
      />
      <path
        d="M50 16 L78 30 L78 53 Q78 74 50 87 Q22 74 22 53 L22 30 Z"
        fill="rgba(200,170,110,0.08)"
        stroke="#C8AA6E"
        strokeWidth="1"
        opacity="0.5"
      />
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
      <circle cx="50" cy="50" r="5" fill="#C8AA6E" />
      <circle cx="50" cy="50" r="3" fill="#FFD700" opacity="0.6" />
    </svg>
  );
}

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

  const endRun = useRunStore((s) => s.endRun);
  const hasRedirected = useRef(false);
  const identityTransitionRef = useRef(false);

  // Redirect if already authenticated (only once)
  useEffect(() => {
    if (isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true;
      const isActive = useRunStore.getState().isActive;
      // Use React Router navigation to avoid full page reload
      navigate(isActive ? ROUTES.RUN : ROUTES.MENU);
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
        const isActive = useRunStore.getState().isActive;
        navigate(isActive ? ROUTES.RUN : ROUTES.MENU);
      }
    } else {
      if (!username.trim()) {
        useAuthStore.setState({ error: 'Username is required' });
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
      const runState = useRunStore.getState();
      const canContinue = await finalizeActiveRunBeforeTransition({
        isActive: runState.isActive,
        runId: runState.runId,
        confirm: (message) => window.confirm(message),
        endRun: (runId) => endRun(false, runId),
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
        {/* Logo Section */}
        <div className="auth-page__logo-section">
          <LolRogueIconSmall />
          <h1 className="auth-page__title">LoL Rogue</h1>
          <p className="auth-page__subtitle">A League of Legends Roguelike</p>
        </div>

        {/* Auth Form Container */}
        <div className="auth-page__container">
          {!isSupabaseConfigured && (
            <div className="auth-page__error">
              Online accounts are unavailable because Supabase is not configured. Guest mode remains
              available.
            </div>
          )}
          {/* Tabs */}
          <div className="auth-page__tabs">
            <button
              type="button"
              className={`auth-page__tab ${mode === 'login' ? 'auth-page__tab--active' : ''}`}
              onClick={() => {
                playUIClick();
                setMode('login');
                clearError();
                clearSuccessMessage();
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={`auth-page__tab ${mode === 'signup' ? 'auth-page__tab--active' : ''}`}
              onClick={() => {
                playUIClick();
                setMode('signup');
                clearError();
                clearSuccessMessage();
              }}
            >
              Sign Up
            </button>
          </div>

          {/* Error Message */}
          {error && <div className="auth-page__error">{error}</div>}

          {/* Success Message */}
          {successMessage && <div className="auth-page__success">{successMessage}</div>}

          {/* Form */}
          <form className="auth-page__form" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <div className="auth-page__form-group">
                  <label className="auth-page__label" htmlFor="username">
                    Username *
                  </label>
                  <input
                    id="username"
                    type="text"
                    className="auth-page__input"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    disabled={isLoading}
                  />
                </div>

                <div className="auth-page__form-group">
                  <label className="auth-page__label" htmlFor="display-name">
                    Display Name
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    className="auth-page__input"
                    placeholder="How you want to appear (optional)"
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
                Email *
              </label>
              <input
                id="email"
                type="email"
                className="auth-page__input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="auth-page__form-group">
              <label className="auth-page__label" htmlFor="password">
                Password *
              </label>
              <input
                id="password"
                type="password"
                className="auth-page__input"
                placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter your password'}
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
                  <span className="auth-page__spinner" />
                  {mode === 'login' ? 'Logging in...' : 'Creating account...'}
                </>
              ) : mode === 'login' ? (
                'Login'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="auth-page__divider">
            <div className="auth-page__divider-line" />
            <span className="auth-page__divider-text">or</span>
            <div className="auth-page__divider-line" />
          </div>

          {/* Guest Button */}
          <button type="button" className="auth-page__guest-btn" onClick={handleGuestPlay}>
            Play as Guest
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="auth-page__footer">
        <p className="auth-page__footer-text">By continuing, you agree to our Terms of Service</p>
      </footer>
    </div>
  );
}
