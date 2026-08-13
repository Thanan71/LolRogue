// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunInventoryPanel } from '@/components/RunInventoryPanel';
import { getCanonicalRunItem } from '@/game/inventory/inventoryRules';
import { buildChampionMastery } from '@/services/masteryService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { InventoryEntry, Item, TeamMember } from '@/types/run';

const originalActions = {
  equipItem: useRunStore.getState().equipItem,
  unequipItem: useRunStore.getState().unequipItem,
  sellItem: useRunStore.getState().sellItem,
  sortInventory: useRunStore.getState().sortInventory,
};

function canonicalItem(itemId: string): Item {
  const item = getCanonicalRunItem(itemId);
  if (!item) throw new Error(`Missing test item ${itemId}.`);
  return item;
}

function entry(
  instanceId: string,
  item: Item,
  equippedToChampionId: string | null = null,
): InventoryEntry {
  return { instanceId, item, equippedToChampionId };
}

const TEAM: TeamMember[] = [
  { championId: 'Garen', level: 3 },
  { championId: 'Lux', level: 3 },
];
const LONG_SWORD = canonicalItem('long_sword');
const CLOTH_ARMOR = canonicalItem('cloth_armor');
const BOOTS = canonicalItem('boots');

describe('RunInventoryPanel', () => {
  const equipItem = vi.fn(() => true);
  const unequipItem = vi.fn(() => true);
  const sellItem = vi.fn(() => true);
  const sortInventory = vi.fn();

  beforeEach(() => {
    equipItem.mockClear();
    unequipItem.mockClear();
    sellItem.mockClear();
    sortInventory.mockClear();
    useEnhancementStore.setState({ enhancements: {} });
    useMasteryStore.setState({ champions: {} });
    useRunStore.setState({
      authorityAttempt: null,
      inventory: [],
      team: [],
      equipItem,
      unequipItem,
      sellItem,
      sortInventory,
    });
  });

  afterEach(() => {
    cleanup();
    useEnhancementStore.setState({ enhancements: {} });
    useMasteryStore.setState({ champions: {} });
    useRunStore.setState({
      authorityAttempt: null,
      inventory: [],
      team: [],
      ...originalActions,
    });
  });

  it('uses local item icons, keeps a visible fallback and filters bag/equipped items', () => {
    const inventory = [
      entry('sword-1', { ...LONG_SWORD, iconUrl: '/broken-item.png' }),
      entry('armor-1', CLOTH_ARMOR, 'Garen'),
    ];
    const { container } = render(<RunInventoryPanel inventory={inventory} team={TEAM} />);

    expect(screen.getByRole('heading', { name: 'Inventaire' })).toBeVisible();
    expect(screen.getByText('2/20')).toBeVisible();
    expect(container.querySelector(`img[src="${CLOTH_ARMOR.iconUrl}"]`)).toBeInTheDocument();

    const swordButton = screen.getByRole('button', { name: /Épée longue.*Dans le sac/i });
    const brokenImage = swordButton.querySelector('img');
    expect(brokenImage).toHaveAttribute('src', '/broken-item.png');
    fireEvent.error(brokenImage as HTMLImageElement);
    expect(brokenImage).toHaveAttribute('hidden');
    expect(swordButton.querySelector('.run-inventory-image__fallback')).toHaveTextContent('É');

    fireEvent.click(screen.getByRole('button', { name: 'Sac' }));
    expect(screen.getByRole('button', { name: /Épée longue/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Armure de tissu/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Équipés' }));
    expect(screen.getByRole('button', { name: /Armure de tissu.*Équipé · Garen/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Épée longue/ })).not.toBeInTheDocument();
  });

  it('previews only affected stats before equipping the selected champion', () => {
    const inventory = [entry('sword-1', LONG_SWORD)];
    useRunStore.setState({ inventory, team: TEAM });
    const { container } = render(<RunInventoryPanel inventory={inventory} team={TEAM} />);

    fireEvent.click(screen.getByRole('button', { name: /Épée longue.*Dans le sac/i }));
    const luxTarget = screen.getByRole('button', { name: /Lux.*0\/6 objets/i });
    expect(luxTarget.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/riot/16.6.1/champions/Lux.png',
    );
    fireEvent.click(luxTarget);

    expect(screen.getByText('Aperçu sur Lux')).toBeVisible();
    const preview = container.querySelector('.run-inventory-preview');
    expect(preview).not.toBeNull();
    expect(within(preview as HTMLElement).getByText("Dégâts d'attaque")).toBeVisible();
    expect(within(preview as HTMLElement).queryByText('Points de vie')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Équiper sur Lux' }));
    expect(equipItem).toHaveBeenCalledWith('sword-1', 'Lux');
    expect(screen.getByRole('status')).toHaveTextContent('Objet équipé : Épée longue sur Lux.');
    expect(screen.getByRole('status')).toHaveClass('run-inventory__feedback--success');
  });

  it('supports transfer, unequip and sale as explicit actions with live feedback', () => {
    const inventory = [entry('sword-1', LONG_SWORD, 'Garen')];
    useRunStore.setState({ inventory, team: TEAM });
    render(<RunInventoryPanel inventory={inventory} team={TEAM} />);

    fireEvent.click(screen.getByRole('button', { name: /Épée longue.*Équipé · Garen/i }));
    expect(screen.getByRole('button', { name: /Garen.*Actuel/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /Lux.*0\/6 objets/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Transférer vers Lux' }));
    expect(equipItem).toHaveBeenCalledWith('sword-1', 'Lux');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Transfert effectué : Épée longue, de Garen à Lux.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Déséquiper' }));
    expect(unequipItem).toHaveBeenCalledWith('sword-1');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Objet replacé dans le sac : Épée longue.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vendre pour 175 or' }));
    expect(sellItem).toHaveBeenCalledWith('sword-1');
    expect(screen.getByRole('status')).toHaveTextContent('Vente confirmée : Épée longue, +175 or.');
    expect(screen.getByText('Sélectionne un objet pour le gérer.')).toBeVisible();
  });

  it('identifies a full equipment loadout and prevents an invalid target action', () => {
    const inventory = [
      entry('boots-1', BOOTS),
      ...Array.from({ length: 6 }, (_, index) => entry(`lux-item-${index}`, LONG_SWORD, 'Lux')),
    ];
    useRunStore.setState({ inventory, team: TEAM });
    render(<RunInventoryPanel inventory={inventory} team={TEAM} />);

    fireEvent.click(screen.getByRole('button', { name: /Bottes.*Dans le sac/i }));
    const fullTarget = screen.getByRole('button', {
      name: /Lux.*6\/6 objets.*Équipement complet/i,
    });
    expect(fullTarget).not.toBeDisabled();
    expect(fullTarget).toHaveAttribute('aria-disabled', 'true');
    fullTarget.focus();
    fireEvent.click(fullTarget);
    expect(fullTarget).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Impossible d’équiper Bottes sur Lux : équipement complet.',
    );
    expect(screen.queryByRole('button', { name: 'Équiper sur Lux' })).not.toBeInTheDocument();
  });

  it('reports an unequip rejection without claiming that the item moved', () => {
    unequipItem.mockReturnValueOnce(false);
    const inventory = [entry('sword-1', LONG_SWORD, 'Garen')];
    render(<RunInventoryPanel inventory={inventory} team={TEAM} />);

    fireEvent.click(screen.getByRole('button', { name: /Épée longue.*Équipé · Garen/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Déséquiper' }));

    expect(unequipItem).toHaveBeenCalledWith('sword-1');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Impossible de déséquiper Épée longue. Réessaie.',
    );
    expect(screen.getByRole('status')).toHaveClass('run-inventory__feedback--error');
    expect(screen.getByRole('heading', { name: 'Épée longue' })).toBeVisible();
  });

  it('closes a selection that leaves the active bag or equipped filter', () => {
    const bagInventory = [entry('sword-1', LONG_SWORD)];
    const { rerender } = render(<RunInventoryPanel inventory={bagInventory} team={TEAM} />);

    const bagFilter = screen.getByRole('button', { name: 'Sac' });
    fireEvent.click(bagFilter);
    fireEvent.click(screen.getByRole('button', { name: /Épée longue.*Dans le sac/i }));
    fireEvent.click(screen.getByRole('button', { name: /Garen.*0\/6 objets/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Équiper sur Garen' }));
    expect(screen.queryByRole('heading', { name: 'Épée longue' })).not.toBeInTheDocument();
    expect(bagFilter).toHaveFocus();

    const equippedInventory = [entry('armor-1', CLOTH_ARMOR, 'Garen')];
    rerender(<RunInventoryPanel inventory={equippedInventory} team={TEAM} />);
    const equippedFilter = screen.getByRole('button', { name: 'Équipés' });
    fireEvent.click(equippedFilter);
    fireEvent.click(screen.getByRole('button', { name: /Armure de tissu.*Équipé · Garen/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Déséquiper' }));
    expect(screen.queryByRole('heading', { name: 'Armure de tissu' })).not.toBeInTheDocument();
    expect(equippedFilter).toHaveFocus();
  });

  it('refreshes the preview when local enhancements and mastery change', () => {
    const inventory = [entry('sword-1', LONG_SWORD)];
    const { container } = render(
      <RunInventoryPanel inventory={inventory} team={[{ championId: 'Garen', level: 3 }]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Épée longue.*Dans le sac/i }));
    fireEvent.click(screen.getByRole('button', { name: /Garen.*0\/6 objets/i }));
    const previewValue = () =>
      container.querySelector('.run-inventory-preview dd')?.textContent ?? '';
    const initialValue = previewValue();

    act(() => {
      useEnhancementStore.setState({
        enhancements: {
          Garen: { unlockedNodes: { fighter_core_1: 1 }, totalCandiesSpent: 20 },
        },
      });
    });
    const enhancedValue = previewValue();
    expect(enhancedValue).not.toBe(initialValue);

    act(() => {
      useMasteryStore.setState({
        champions: { Garen: buildChampionMastery('Garen', 700, []) },
      });
    });
    expect(previewValue()).not.toBe(enhancedValue);
  });

  it('closes the current selection with the touch action or Escape', () => {
    const inventory = [entry('sword-1', LONG_SWORD)];
    render(<RunInventoryPanel inventory={inventory} team={TEAM} />);

    const itemButton = screen.getByRole('button', { name: /Épée longue.*Dans le sac/i });
    fireEvent.click(itemButton);
    expect(screen.getByRole('heading', { name: 'Épée longue' })).toBeVisible();

    const closeButton = screen.getByRole('button', { name: 'Fermer : Épée longue' });
    closeButton.focus();
    fireEvent.click(closeButton);
    expect(screen.queryByRole('heading', { name: 'Épée longue' })).not.toBeInTheDocument();
    expect(itemButton).toHaveFocus();

    fireEvent.click(itemButton);
    expect(screen.getByRole('heading', { name: 'Épée longue' })).toBeVisible();

    fireEvent.keyDown(itemButton, { key: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Épée longue' })).not.toBeInTheDocument();
    expect(screen.getByText('Sélectionne un objet pour le gérer.')).toBeVisible();
  });
});
