// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  EMPTY_ENHANCEMENT_LOADOUT_HASH,
  EMPTY_RUNE_LOADOUT_HASH,
  SOLO_GAREN_COMPOSITION_HASH,
} from '@/game/balance/fieldCalibrationComparison';
import { getAdminFieldCalibrationCopy } from '@/i18n/adminFieldCalibration';
import { AdminErrorNotice } from '@/features/administration/ui/AdminErrorNotice';
import { AdminFieldCalibrationPanel } from '@/features/administration/ui/AdminFieldCalibrationPanel';
import { AdminTabList, AdministrationSubTabs } from '@/features/administration/ui/AdminTabList';

describe('admin data feedback', () => {
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
    render(<AdminTabList group="overview" onSelect={select} />);
    const dashboard = screen.getByRole('tab', { name: /Vue globale/i });
    expect(dashboard).toHaveAttribute('aria-controls', 'admin-group-panel-overview');
    expect(screen.getAllByRole('tab', { name: /Équilibrage/ })).toHaveLength(1);
    fireEvent.keyDown(dashboard, { key: 'ArrowRight' });
    expect(select).toHaveBeenCalledWith('players');
  });

  it('offers six groups and keyboard navigation within monitoring subsections', () => {
    const select = vi.fn();
    const { unmount } = render(<AdminTabList group="overview" onSelect={select} />);
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByRole('tab', { name: 'Vue globale' })).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Vue globale' }), { key: 'End' });
    expect(select).toHaveBeenLastCalledWith('monitoring');
    unmount();
    render(<AdministrationSubTabs group="monitoring" view="logs" onSelect={select} />);
    const logs = screen.getByRole('tab', { name: 'Journaux' });
    expect(logs).toHaveAttribute('aria-controls', 'admin-panel-logs');
    fireEvent.keyDown(logs, { key: 'ArrowLeft' });
    expect(select).toHaveBeenLastCalledWith('service');
    fireEvent.keyDown(logs, { key: 'Home' });
    expect(select).toHaveBeenLastCalledWith('logs');
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

    expect(screen.getByText(/aucun ajustement automatique/i)).toBeInTheDocument();
    const comparison = screen.getByRole('table', {
      name: /Comparaison des cohortes terrain vérifiées/i,
    });
    expect(comparison).toHaveTextContent('safety-first@1');
    expect(comparison).toHaveTextContent('economy-first@1');
    expect(comparison).toHaveTextContent('Wilson');
    expect(comparison).toHaveTextContent('Revue à ouvrir');
    expect(comparison).toHaveTextContent('intervalles séparés');
  });

  it('shows localized augment names in field calibration rows', () => {
    render(
      <AdminFieldCalibrationPanel
        fieldCohorts={[]}
        championCohorts={[]}
        augmentCohorts={[
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
            augmentId: 'iron_skin',
            cohortSampleSize: 30,
            sampleSize: 15,
            selectionRate: 0.5,
            winRate: 0.5,
            winRateWilson95: { confidence: 0.95, lower: 0.3, upper: 0.7 },
            averageWavesCompleted: 9,
            averageBiomesCompleted: 2.5,
            averageGoldBalance: 130,
          },
        ]}
      />,
    );

    expect(screen.getByText('Peau de fer')).toBeInTheDocument();
    expect(screen.queryByText('iron_skin')).not.toBeInTheDocument();
  });

  it('keeps the calibration copy complete in French and English', () => {
    const french = getAdminFieldCalibrationCopy('fr-FR');
    const english = getAdminFieldCalibrationCopy('en-US');

    expect(french.title).toBe('Calibration terrain vérifiée');
    expect(french.description).toMatch(/aucune session de test humaine réalisée/i);
    expect(french.comparison.noBaseline).toBe('Aucune référence aux dimensions identiques');
    expect(french.augments.caption).toBe('Comparaison conditionnelle des améliorations');
    expect(english.title).toBe('Verified field calibration');
    expect(english.description).toMatch(/human playtests have not been run/i);
    expect(english.review.signals).toEqual({
      win_rate: 'win rate',
      biomes_completed: 'biomes completed',
      gold_balance: 'gold balance',
    });
  });
});
