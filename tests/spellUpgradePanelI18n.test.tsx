// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scanUserCopyFile } from './helpers/userCopyScanner';

vi.mock('@/audio', () => ({
  playUIClick: vi.fn(),
  playUIHover: vi.fn(),
  playSFX: vi.fn(),
}));

function setStoredLocale(locale: 'fr-FR' | 'en-US'): void {
  window.localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: locale } }));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('spell upgrade panel i18n', () => {
  it('renders spell state, impacts and feedback in English', async () => {
    setStoredLocale('en-US');
    vi.resetModules();
    const { SpellUpgradePanel } = await import('@/components/SpellUpgradePanel');

    render(
      <SpellUpgradePanel
        championId="Garen"
        member={{ championId: 'Garen', level: 5, spellRanks: { Q: 1, W: 1, E: 1, R: 1 } }}
        stats={{ attackDamage: 100, abilityPower: 80 }}
        onUpgrade={() => true}
      />,
    );

    const qButton = screen.getByRole('button', { name: /Decisive Strike.*Rank 1\/5/ });
    fireEvent.focus(qButton);
    expect(screen.getByRole('region', { name: 'Current rank · 1' })).toHaveTextContent(
      'Physical damage',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Q · rank 1 → 2' }));
    expect(screen.getByRole('status')).toHaveTextContent("Garen's Q upgraded to rank 2.");
    expect(screen.queryByText(/Dégâts estimés/i)).not.toBeInTheDocument();
  });

  it('contains no raw user copy in the spell upgrade panel', () => {
    expect(scanUserCopyFile(`${process.cwd()}/src/components/SpellUpgradePanel.tsx`)).toEqual([]);
  });
});
