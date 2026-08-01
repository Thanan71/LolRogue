// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminErrorNotice } from '@/pages/admin/AdminErrorNotice';
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
    expect(select).toHaveBeenCalledWith('logs');
  });
});
