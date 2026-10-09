import { useState } from 'react';
import { authRecoveryCopy as copy } from '@/i18n/authRecoveryContent';
import { fr } from '@/i18n/fr';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

interface PasswordRecoveryFormProps {
  requestOnly: boolean;
  onRequestLink: () => void;
  onBack: () => void;
}

export function PasswordRecoveryForm({
  requestOnly,
  onRequestLink,
  onBack,
}: PasswordRecoveryFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const session = useAuthStore((state) => state.session);
  const busy = useAuthStore((state) => state.isRecoveryLoading);
  const requestPasswordReset = useAuthStore((state) => state.requestPasswordReset);
  const updateRecoveredPassword = useAuthStore((state) => state.updateRecoveredPassword);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setValidationError(null);
    if (requestOnly) {
      await requestPasswordReset(email);
    } else {
      if (password.length < 6) {
        setValidationError(copy.passwordHelp);
        return;
      }
      if (password !== confirmation) {
        setValidationError(copy.mismatch);
        return;
      }
      await updateRecoveredPassword(password);
    }
  }

  if (!requestOnly && !session) {
    return (
      <div className="auth-page__recovery-actions">
        <button type="button" className="auth-page__submit" onClick={onRequestLink}>
          {copy.newLink}
        </button>
        <button type="button" className="auth-page__text-action" onClick={onBack}>
          {copy.backToLogin}
        </button>
      </div>
    );
  }

  return (
    <form className="auth-page__form" onSubmit={(event) => void submit(event)} aria-busy={busy}>
      {requestOnly ? (
        <div className="auth-page__form-group">
          <label className="auth-page__label" htmlFor="recovery-email">
            {fr.auth.email}
          </label>
          <input
            id="recovery-email"
            className="auth-page__input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy}
          />
        </div>
      ) : (
        <>
          <div className="auth-page__form-group">
            <label className="auth-page__label" htmlFor="recovery-password">
              {copy.password}
            </label>
            <input
              id="recovery-password"
              className="auth-page__input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              aria-describedby="recovery-password-help"
              disabled={busy}
            />
            <p id="recovery-password-help" className="auth-page__form-help">
              {copy.passwordHelp}
            </p>
          </div>
          <div className="auth-page__form-group">
            <label className="auth-page__label" htmlFor="recovery-confirmation">
              {copy.confirmPassword}
            </label>
            <input
              id="recovery-confirmation"
              className="auth-page__input"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              minLength={6}
              aria-invalid={validationError !== null}
              aria-describedby={validationError ? 'recovery-validation-error' : undefined}
              disabled={busy}
            />
          </div>
        </>
      )}
      {validationError && (
        <p id="recovery-validation-error" className="auth-page__error" role="alert">
          {validationError}
        </p>
      )}
      <button
        type="submit"
        className="auth-page__submit"
        disabled={
          !isSupabaseConfigured ||
          busy ||
          (requestOnly ? !email.trim() : !password || !confirmation)
        }
      >
        {requestOnly ? (busy ? copy.sending : copy.send) : busy ? copy.updating : copy.update}
      </button>
      <button type="button" className="auth-page__text-action" onClick={onBack} disabled={busy}>
        {copy.backToLogin}
      </button>
    </form>
  );
}
