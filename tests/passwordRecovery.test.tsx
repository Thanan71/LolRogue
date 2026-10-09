// @vitest-environment jsdom
import type { Session } from '@supabase/supabase-js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPasswordRecoveryLocation } from '@/auth/passwordRecovery';
import { authRecoveryContent } from '@/i18n/authRecoveryContent';
import { PasswordRecoveryForm } from '@/pages/auth/PasswordRecoveryForm';
import { useAuthStore } from '@/stores/authStore';

const actions = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  updateRecoveredPassword: vi.fn(),
}));
vi.mock('@/services/supabaseClient', () => ({ isSupabaseConfigured: true }));
vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ session: null, isRecoveryLoading: false, ...actions })) };
});

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ session: null, isRecoveryLoading: false });
});

describe('password recovery callback and form', () => {
  it('recognizes recovery callbacks and expiry without treating OAuth and magic-link callbacks as recovery', () => {
    expect(
      readPasswordRecoveryLocation({
        search: '?mode=recovery',
        hash: '#access_token=private&type=recovery',
      }),
    ).toEqual({ requested: true, failed: false });
    expect(
      readPasswordRecoveryLocation({
        search: '?mode=recovery',
        hash: '#error=access_denied&error_code=otp_expired',
      }),
    ).toEqual({ requested: true, failed: true });
    expect(
      readPasswordRecoveryLocation({ search: '?code=opaque', hash: '#type=magiclink' }),
    ).toEqual({ requested: false, failed: false });
    expect(readPasswordRecoveryLocation({ search: '', hash: '#error=access_denied' })).toEqual({
      requested: false,
      failed: false,
    });
  });

  it('offers a new link without password fields when no recovery session exists', () => {
    const onRequestLink = vi.fn();
    render(
      <PasswordRecoveryForm requestOnly={false} onRequestLink={onRequestLink} onBack={vi.fn()} />,
    );
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Demander un nouveau lien' }));
    expect(onRequestLink).toHaveBeenCalledOnce();
  });

  it('requires matching passwords before updating the recovered account', () => {
    useAuthStore.setState({ session: { user: { id: 'a' } } as Session });
    render(<PasswordRecoveryForm requestOnly={false} onRequestLink={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), {
      target: { value: 'new-secret' },
    });
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
      target: { value: 'other-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    expect(screen.getByRole('alert').textContent).toContain('identiques');
    expect(actions.updateRecoveredPassword).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirmer le mot de passe'), {
      target: { value: 'new-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le mot de passe' }));
    expect(actions.updateRecoveredPassword).toHaveBeenCalledWith('new-secret');
  });

  it('requests a link from the email form and provides complete French and English copy', () => {
    render(<PasswordRecoveryForm requestOnly onRequestLink={vi.fn()} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), {
      target: { value: 'a@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le lien' }));
    expect(actions.requestPasswordReset).toHaveBeenCalledWith('a@example.test');
    expect(Object.keys(authRecoveryContent['fr-FR'])).toEqual(
      Object.keys(authRecoveryContent['en-US']),
    );
    expect(authRecoveryContent['en-US'].sent).toContain('If an account');
  });
});
