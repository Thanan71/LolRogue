// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpellUpgradePanel } from '@/components/SpellUpgradePanel';
import { fr } from '@/i18n/fr';

describe('SpellUpgradePanel', () => {
  it('renders Data Dragon icons and calls the unchanged slot callback', () => {
    const onUpgrade = vi.fn(() => true);
    render(
      <SpellUpgradePanel
        championId="Garen"
        member={{ championId: 'Garen', level: 5, spellRanks: { Q: 1, W: 1, E: 1, R: 1 } }}
        onUpgrade={onUpgrade}
      />,
    );

    const qButton = screen.getByRole('button', { name: /Coup décisif.*Rang 1\/5/ });
    const qImage = qButton.querySelector('img');
    expect(qImage).toHaveAttribute('src', '/assets/riot/16.6.1/spells/GarenQ.png');

    fireEvent.click(qButton);
    fireEvent.click(screen.getByRole('button', { name: 'Améliorer Q · rang 1 → 2' }));
    expect(onUpgrade).toHaveBeenCalledWith('Q');
    expect(screen.getByRole('status')).toHaveTextContent('Q de Garen amélioré au rang 2.');
  });

  it('exposes calculated damage type and amount on focus and touch selection', () => {
    render(
      <SpellUpgradePanel
        championId="Garen"
        member={{ championId: 'Garen', level: 5, spellRanks: { Q: 1, W: 1, E: 1, R: 1 } }}
        stats={{ attackDamage: 100, abilityPower: 80 }}
        onUpgrade={vi.fn()}
      />,
    );

    const qButton = screen.getByRole('button', { name: /Coup décisif/ });
    fireEvent.focus(qButton);
    const detailId = qButton.getAttribute('aria-controls') ?? '';
    const detail = document.getElementById(detailId)!;
    const currentRank = within(detail).getByRole('region', { name: 'Rang actuel · 1' });
    const nextRank = within(detail).getByRole('region', { name: 'Prochain rang · 2' });
    expect(currentRank).toHaveTextContent('Dégâts physiques');
    expect(currentRank).toHaveTextContent('80 · avant défenses');
    expect(nextRank).toHaveTextContent('Dégâts physiques');
    expect(nextRank).toHaveTextContent('110 · avant défenses');

    const rButton = screen.getByRole('button', { name: /Justice de Demacia/ });
    fireEvent.pointerDown(rButton);
    const rDetailId = rButton.getAttribute('aria-controls') ?? '';
    expect(document.getElementById(rDetailId)).toHaveTextContent('Dégâts bruts');
    expect(document.getElementById(rDetailId)).toHaveTextContent('150 · avant défenses');
  });

  it('focuses the first available blocking choice and reports a rejected mutation', async () => {
    const onUpgrade = vi.fn(() => false);
    render(
      <SpellUpgradePanel
        championId="Garen"
        member={{ championId: 'Garen', level: 5, spellRanks: { Q: 3, W: 1, E: 1, R: 1 } }}
        onUpgrade={onUpgrade}
        autoFocus
      />,
    );

    const wButton = screen.getByRole('button', { name: /Courage/ });
    await waitFor(() => expect(wButton).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Améliorer W · rang 1 → 2' }));

    expect(onUpgrade).toHaveBeenCalledWith('W');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Impossible d’améliorer W de Garen. Réessayez.',
    );
  });

  it('announces maximum and level locks without allowing the callback', () => {
    const onUpgrade = vi.fn();
    render(
      <SpellUpgradePanel
        championId="Garen"
        member={{ championId: 'Garen', level: 1, spellRanks: { Q: 5, W: 1, E: 1, R: 1 } }}
        onUpgrade={onUpgrade}
      />,
    );

    const qButton = screen.getByRole('button', { name: /Coup décisif/ });
    const wButton = screen.getByRole('button', { name: /Courage/ });
    fireEvent.click(qButton);
    let confirm = screen.getByRole('button', { name: 'Q · rang maximum' });
    expect(confirm).toBeDisabled();
    expect(document.getElementById(confirm.getAttribute('aria-describedby')!)).toHaveTextContent(
      fr.run.maximumRank,
    );

    fireEvent.click(wButton);
    confirm = screen.getByRole('button', { name: 'W · niveau requis' });
    expect(confirm).toBeDisabled();
    expect(document.getElementById(confirm.getAttribute('aria-describedby')!)).toHaveTextContent(
      fr.run.levelRequired,
    );

    fireEvent.click(confirm);
    expect(onUpgrade).not.toHaveBeenCalled();
  });
});
