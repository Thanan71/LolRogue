// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RunRejectionHistory } from '@/components/history/RunRejectionHistory';
import type { IRunRepository } from '@/services/interfaces/IRunRepository';

vi.mock('@/audio', () => ({ playUIClick: vi.fn(), playUIHover: vi.fn() }));
const entry = {
  attemptId: 'attempt-owner',
  startedAt: '2026-10-07T09:00:00Z',
  rejectedAt: '2026-10-07T10:00:00Z',
  difficulty: 'normal',
  mode: 'normal',
  engineVersion: 'run-engine-v21',
  gameplayRulesetVersion: 21,
  progressionRulesetVersion: 2,
  rejectionCode: 'pending_choice',
};
describe('owner rejection history', () => {
  it('loads only on demand, renders localized guidance and keeps technical detail collapsed', async () => {
    const getPlayerRunRejections = vi
      .fn()
      .mockResolvedValue({ data: [entry], error: null, nextCursor: null });
    render(
      <RunRejectionHistory
        playerId="owner"
        repository={{ getPlayerRunRejections } as unknown as IRunRepository}
      />,
    );
    expect(getPlayerRunRejections).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les tentatives rejetées' }));
    const code = await screen.findByText('pending_choice');
    expect(code).not.toBeVisible();
    const diagnostic = screen.getByText('Diagnostic technique');
    diagnostic.closest('details')?.setAttribute('open', '');
    diagnostic.closest('details')?.parentElement?.setAttribute('open', '');
    expect(code).toBeVisible();
    expect(screen.getByText(/Une amélioration obligatoire/)).toBeVisible();
    expect(getPlayerRunRejections).toHaveBeenCalledWith('owner', 20, undefined);
  });
  it('clears a previous owner and ignores its response after an account switch', async () => {
    let resolve: (value: unknown) => void = () => {};
    const getPlayerRunRejections = vi.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const repository = { getPlayerRunRejections } as unknown as IRunRepository;
    const view = render(
      <RunRejectionHistory key="first" playerId="first" repository={repository} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les tentatives rejetées' }));
    view.rerender(<RunRejectionHistory key="second" playerId="second" repository={repository} />);
    await act(async () => {
      resolve({ data: [entry], error: null, nextCursor: null });
    });
    expect(screen.queryByText('pending_choice')).not.toBeInTheDocument();
  });
  it('handles server errors and retries', async () => {
    const getPlayerRunRejections = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error('forbidden') })
      .mockResolvedValueOnce({ data: [], error: null, nextCursor: null });
    render(
      <RunRejectionHistory
        playerId="owner"
        repository={{ getPlayerRunRejections } as unknown as IRunRepository}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les tentatives rejetées' }));
    await screen.findByText('Les tentatives rejetées n’ont pas pu être chargées.');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer le chargement' }));
    expect(await screen.findByText('Aucune tentative rejetée')).toBeVisible();
  });
});
