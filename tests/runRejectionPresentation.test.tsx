// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationRegion } from '@/components/NotificationRegion';
import { fr } from '@/i18n/fr';
import { gameOverCopy } from '@/i18n/gameOverContent';
import { runError } from '@/i18n/runErrorContent';
import { GameOverPage } from '@/pages/GameOverPage';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { RunSummary } from '@/types/run';

vi.mock('@/audio', () => ({ playSFX: vi.fn(), playUIClick: vi.fn() }));

const summary: RunSummary = {
  won: false,
  runLevel: 2,
  wavesCompleted: 3,
  biomesVisited: ['top_lane'],
  totalKills: 8,
  totalDamage: 100,
  goldEarned: 150,
  goldSpent: 0,
  goldBalance: 150,
  itemEvents: [],
  championStats: [],
};

function renderGameOver() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
      <GameOverPage />
    </MemoryRouter>,
  );
}

describe('rejected progression presentation', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, player: null, isGuest: true, isAuthenticated: false });
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      saveStatus: 'failed',
      saveFailureKind: 'terminal',
      saveError: 'pending_choice: internal verifier message',
      saveDiagnostic: {
        attemptId: '11111111-1111-4111-8111-111111111111',
        engineVersion: 'run-engine-v21',
        rejectionCode: 'pending_choice',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useRunStore.setState(RUN_INITIAL_STATE);
  });

  it('explains a final rejection, hides rewards even without auth, and folds the support code', () => {
    renderGameOver();
    expect(screen.getByRole('alert')).toHaveTextContent(runError.missingChoice);
    expect(screen.getByRole('alert')).toHaveTextContent(gameOverCopy.save.terminalOutcome);
    expect(
      screen.queryByRole('button', { name: fr.gameOver.retryVerification }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/bonbons/)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal verifier/)).not.toBeInTheDocument();
    const details = screen.getByText(gameOverCopy.save.supportDetails).closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('pending_choice');
  });

  it('copies only attempt identity, version and code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    renderGameOver();
    fireEvent.click(
      screen.getByRole('button', { name: gameOverCopy.save.copyDiagnostic, hidden: true }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toBe(
      'Identifiant de tentative: 11111111-1111-4111-8111-111111111111\nVersion de l’autorité: run-engine-v21\nCode de rejet: pending_choice',
    );
    expect(screen.getByText(gameOverCopy.save.diagnosticCopied)).toBeInTheDocument();
  });

  it.each(['denied', 'unavailable'])('offers manual copy when clipboard is %s', async (failure) => {
    vi.stubGlobal(
      'navigator',
      failure === 'denied'
        ? { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } }
        : {},
    );
    renderGameOver();
    fireEvent.click(
      screen.getByRole('button', { name: gameOverCopy.save.copyDiagnostic, hidden: true }),
    );
    expect(await screen.findByText(gameOverCopy.save.diagnosticCopyFailed)).toBeInTheDocument();
  });

  it('does not offer a terminal retry from the notification after returning to the menu', () => {
    render(<NotificationRegion />);
    expect(screen.getByRole('alert')).toHaveTextContent(runError.missingChoice);
    expect(screen.getByRole('alert')).toHaveTextContent(gameOverCopy.save.terminalOutcome);
    expect(
      screen.queryByRole('button', { name: fr.notifications.retrySave }),
    ).not.toBeInTheDocument();
  });

  it('avoids duplicating the full rejection over Game Over', () => {
    render(<NotificationRegion showRunSaveNotifications={false} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers retry with a folded diagnostic for a server error', () => {
    useRunStore.setState({
      saveFailureKind: 'retryable',
      saveError: runError.verificationFailed(),
    });
    renderGameOver();
    expect(screen.getByRole('alert')).toHaveTextContent(runError.verificationFailed());
    expect(screen.getByRole('alert')).toHaveTextContent(gameOverCopy.save.retryOutcome);
    expect(screen.getByRole('button', { name: fr.gameOver.retryVerification })).toBeVisible();
    expect(screen.getByText(gameOverCopy.save.supportDetails)).toBeVisible();
    expect(screen.queryByText(/bonbons/)).not.toBeInTheDocument();
  });
});
