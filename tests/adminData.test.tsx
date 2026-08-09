// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminAuthorityPanel } from '@/pages/admin/AdminAuthorityPanel';
import { AdminErrorNotice } from '@/pages/admin/AdminErrorNotice';
import { AdminModerationPanel } from '@/pages/admin/AdminModerationPanel';
import { AdminTabList } from '@/pages/admin/AdminTabList';
import { loadAllAdminSections } from '@/pages/admin/useAdminData';

describe('admin data feedback', () => {
  it('does not complete initial loading before every admin request settles', async () => {
    let resolveLogs: (() => void) | undefined;
    const logs = new Promise<void>((resolve) => {
      resolveLogs = resolve;
    });
    const completed = vi.fn();
    const loading = loadAllAdminSections([
      () => Promise.resolve(),
      () => logs,
      () => Promise.resolve(),
      () => Promise.resolve(),
    ]).then(completed);

    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    resolveLogs?.();
    await loading;
    expect(completed).toHaveBeenCalledOnce();
  });

  it('shows an actionable retry and disables it while retrying', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <AdminErrorNotice message="Lecture refusée" onRetry={retry} retrying={false} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Lecture refusée');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<AdminErrorNotice message="Lecture refusée" onRetry={retry} retrying />);
    expect(screen.getByRole('button', { name: 'Nouvelle tentative…' })).toBeDisabled();
  });

  it('moves between tabs with arrows and exposes the tab/panel relationship', () => {
    const select = vi.fn();
    render(<AdminTabList activeTab="dashboard" onSelect={select} />);
    const dashboard = screen.getByRole('tab', { name: /Tableau de bord/i });
    expect(dashboard).toHaveAttribute('aria-controls', 'admin-panel-dashboard');
    fireEvent.keyDown(dashboard, { key: 'ArrowRight' });
    expect(select).toHaveBeenCalledWith('authority');
  });

  it('shows authority alerts and the bounded recent rejection runbook', () => {
    render(
      <AdminAuthorityPanel
        aggregates={[
          {
            windowStartedAt: new Date().toISOString(),
            engineVersion: 'run-engine-v13',
            gameplayRulesetVersion: 13,
            rejectionCode: 'pending_choice',
            attemptCount: 5,
            startedCount: 0,
            finishedCount: 0,
            verifiedCount: 0,
            rejectedCount: 5,
            expiredCount: 0,
          },
        ]}
        signals={[
          {
            engineVersion: 'run-engine-v13',
            gameplayRulesetVersion: 13,
            attemptCount: 5,
            rejectedCount: 5,
            rejectionRate: 1,
            rejectionCodes: ['pending_choice'],
            unknownCodes: [],
            reasons: ['rejection_rate'],
          },
        ]}
        rejections={[
          {
            attemptId: '11111111-1111-4111-8111-111111111111',
            rejectedAt: '2026-08-09T12:10:00.000Z',
            engineVersion: 'run-engine-v13',
            gameplayRulesetVersion: 13,
            rejectionCode: 'pending_choice',
          },
        ]}
        loading={false}
        error={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('100.0 % de rejets');
    expect(
      screen.getByRole('table', { name: 'Derniers rejets de vérification authority' }),
    ).toHaveTextContent('11111111-1111-4111-8111-111111111111');
    expect(screen.getAllByText('pending_choice')).toHaveLength(1);
  });

  it('requires confirmation before sending one bounded score invalidation', async () => {
    const invalidate = vi.fn().mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <AdminModerationPanel
        reports={[
          {
            id: 'report-1',
            dailyRunId: 'daily-1',
            reason: 'Le replay ne correspond pas au score publié.',
            createdAt: '2026-08-09T10:00:00.000Z',
            dailyDate: '2026-08-09',
            score: 12_345,
          },
        ]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        onInvalidate={invalidate}
      />,
    );

    const reason = screen.getByRole('textbox', { name: 'Motif d’invalidation' });
    fireEvent.change(reason, { target: { value: 'Score manipulé confirmé après revue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invalider le score' }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith('daily-1', 'Score manipulé confirmé après revue');
  });
});
