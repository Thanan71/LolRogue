// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_ENHANCEMENT_LOADOUT_HASH,
  EMPTY_RUNE_LOADOUT_HASH,
  SOLO_GAREN_COMPOSITION_HASH,
} from '@/game/balance/fieldCalibrationComparison';
import { getAdminFieldCalibrationCopy } from '@/i18n/adminFieldCalibration';
import { AdminAuthorityPanel } from '@/pages/admin/AdminAuthorityPanel';
import { AdminErrorNotice } from '@/pages/admin/AdminErrorNotice';
import { AdminFieldCalibrationPanel } from '@/pages/admin/AdminFieldCalibrationPanel';
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
        fieldCohorts={[]}
        fieldChampionCohorts={[]}
        fieldAugmentCohorts={[]}
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

  it('shows interval-aware simulation and field comparisons without authorizing tuning', () => {
    render(
      <AdminFieldCalibrationPanel
        fieldCohorts={[
          {
            observedOn: '2026-08-25',
            gameplayRulesetVersion: 21,
            engineVersion: 'run-engine-v21',
            gameplayContentHash: '9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6',
            difficulty: 'normal',
            mode: 'normal',
            initialTeamSize: 1,
            initialCompositionHash: SOLO_GAREN_COMPOSITION_HASH,
            metaLevel: 0,
            runeLoadoutHash: EMPTY_RUNE_LOADOUT_HASH,
            enhancementLoadoutHash: EMPTY_ENHANCEMENT_LOADOUT_HASH,
            sampleSize: 30,
            wins: 15,
            defeats: 15,
            winRate: 0.5,
            winRateWilson95: { confidence: 0.95, lower: 0.3315, upper: 0.6685 },
            averageWavesCompleted: 9,
            medianWavesCompleted: 8,
            averageBiomesCompleted: 2.5,
            medianBiomesCompleted: 2,
            averageGoldEarned: 240,
            averageGoldSpent: 110,
            averageGoldBalance: 130,
            deathBiomeCounts: { top_lane: 15 },
          },
        ]}
        championCohorts={[]}
        augmentCohorts={[]}
      />,
    );

    expect(screen.getByText(/aucun tuning automatique/i)).toBeInTheDocument();
    const comparison = screen.getByRole('table', {
      name: /Comparaison des cohortes terrain vérifiées/i,
    });
    expect(comparison).toHaveTextContent('safety-first@1');
    expect(comparison).toHaveTextContent('economy-first@1');
    expect(comparison).toHaveTextContent('Wilson');
    expect(comparison).toHaveTextContent('Revue à ouvrir');
    expect(comparison).toHaveTextContent('intervalles séparés');
  });

  it('keeps the calibration copy complete in French and English', () => {
    const french = getAdminFieldCalibrationCopy('fr-FR');
    const english = getAdminFieldCalibrationCopy('en-US');

    expect(french.title).toBe('Calibration terrain vérifiée');
    expect(french.description).toMatch(/playtests humains non réalisés/i);
    expect(english.title).toBe('Verified field calibration');
    expect(english.description).toMatch(/human playtests have not been run/i);
    expect(english.review.signals).toEqual({
      win_rate: 'win rate',
      biomes_completed: 'biomes completed',
      gold_balance: 'gold balance',
    });
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
