// @vitest-environment jsdom

import type { User } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChampionPurchaseAction } from '@/components/ChampionEconomy';
import { CHAMPION_ECONOMY_CATALOG, getChampionAccess } from '@/domain/championEconomy';
import { getChampionEconomyContent } from '@/i18n/championEconomyContent';
import { DatabasePage } from '@/pages/DatabasePage';
import { StarterSelectPage } from '@/pages/StarterSelectPage';
import { ChampionEconomyError } from '@/services/championEconomyService';
import { useAuthStore } from '@/stores/authStore';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { ChampionEconomySnapshot, ChampionPurchaseResult } from '@/types/championEconomy';

vi.mock('@/audio', () => ({ playUIClick: vi.fn() }));
vi.mock('@/services/supabaseClient', async (original) => ({
  ...(await original<typeof import('@/services/supabaseClient')>()),
  isSupabaseConfigured: true,
}));

const refresh = vi.fn(async () => undefined);
const purchase = vi.fn<ReturnType<typeof useChampionEconomyStore.getState>['purchase']>();
let serverNow: number;

function snapshot(): ChampionEconomySnapshot {
  return {
    enabled: true,
    economyVersion: 1,
    catalogVersion: 1,
    gameplayRulesetVersion: 21,
    serverNow: '2026-10-08T12:00:00.000Z',
    rotation: {
      id: '2026-W41-v1-r21',
      startsAt: '2026-10-05T00:00:00.000Z',
      endsAt: '2026-10-12T00:00:00.000Z',
      championIds: ['Darius', 'Jinx', 'Leona', 'Malphite', 'Soraka'],
      rulesetVersion: 21,
      algorithmVersion: 1,
    },
    catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
    wallet: { shardsBalance: 900, lifetimeEarned: 900, lifetimeSpent: 0 },
    ownedChampionIds: [],
    firstWinChampionIds: [],
  };
}

function renderPurchase() {
  return render(
    <MemoryRouter>
      <button type="button" id="purchase-focus">
        Choisir Lux
      </button>
      <ChampionPurchaseAction championId="Lux" championName="Lux" returnFocusId="purchase-focus" />
    </MemoryRouter>,
  );
}

function renderStarter(path = '/starter-select') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StarterSelectPage />
    </MemoryRouter>,
  );
}

function completePurchase(): ChampionPurchaseResult {
  const current = useChampionEconomyStore.getState().snapshot!;
  const next = {
    ...current,
    ownedChampionIds: ['Lux'],
    wallet: { shardsBalance: 500, lifetimeEarned: 900, lifetimeSpent: 400 },
  };
  useChampionEconomyStore.setState({ snapshot: next });
  return { replayed: false, snapshot: next };
}

describe('champion economy purchase UI', () => {
  beforeEach(() => {
    refresh.mockClear();
    purchase.mockReset();
    serverNow = Date.parse('2026-10-08T12:00:00.000Z');
    useChampionEconomyStore.setState({
      snapshot: snapshot(),
      status: 'ready',
      error: null,
      purchasingChampionId: null,
      userId: 'ui-user',
      refresh,
      purchase,
      getServerNow: () => serverNow,
      getAccess: (id) =>
        getChampionAccess(id, useChampionEconomyStore.getState().snapshot!, serverNow),
    });
    useAuthStore.setState({
      user: { id: 'ui-user', email: 'ui@example.test' } as User,
      player: null,
      isGuest: false,
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
    });
    useRunStore.setState({ ...RUN_INITIAL_STATE, isActive: false, pendingAuthorityStart: null });
    useEnhancementStore.getState().reset();
  });

  it('confirms champion, versioned price and before/after balance; disables duplicate clicks and restores focus', async () => {
    let resolve!: (result: ChampionPurchaseResult) => void;
    purchase.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderPurchase();
    const buy = screen.getByRole('button', { name: /Acheter Lux/ });
    buy.focus();
    fireEvent.click(buy);
    const dialog = screen.getByRole('dialog', { name: /Débloquer Lux définitivement/ });
    expect(within(dialog).getByText('400 Éclats')).toBeInTheDocument();
    expect(within(dialog).getByText('900 Éclats')).toBeInTheDocument();
    expect(within(dialog).getByText('500 Éclats')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Confirmer l’achat' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(purchase).toHaveBeenCalledTimes(1);
    expect(purchase).toHaveBeenCalledWith('Lux', {
      priceShards: 400,
      economyVersion: 1,
      catalogVersion: 1,
    });
    expect(screen.getByRole('button', { name: 'Achat en cours…' })).toBeDisabled();
    await act(async () => resolve(completePurchase()));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Lux est débloqué. Solde : 500 Éclats.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choisir Lux' })).toHaveFocus());
  });

  it('shows the precise missing amount and never submits an unaffordable purchase', () => {
    const current = snapshot();
    current.wallet!.shardsBalance = 183;
    useChampionEconomyStore.setState({ snapshot: current });
    renderPurchase();
    fireEvent.click(screen.getByRole('button', { name: /Acheter Lux/ }));
    expect(screen.getByText('Il te manque 217 Éclats.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer l’achat' })).toBeDisabled();
    expect(purchase).not.toHaveBeenCalled();
  });

  it('requires a fresh review and confirmation after the server rejects a stale price', async () => {
    purchase
      .mockImplementationOnce(async () => {
        const current = snapshot();
        current.catalogVersion = 2;
        current.catalog = current.catalog.map((entry) =>
          entry.championId === 'Lux' ? { ...entry, priceShards: 450 } : entry,
        );
        useChampionEconomyStore.setState({ snapshot: current });
        throw new ChampionEconomyError('champion_price_changed');
      })
      .mockImplementationOnce(async () => completePurchase());
    renderPurchase();
    fireEvent.click(screen.getByRole('button', { name: /Acheter Lux/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’achat' }));
    await screen.findByRole('button', { name: 'Revoir le prix actualisé' });
    expect(screen.getByRole('button', { name: 'Revoir le prix actualisé' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Confirmer l’achat' })).not.toBeInTheDocument();
    expect(purchase).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Revoir le prix actualisé' }));
    expect(screen.getAllByText('450 Éclats')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’achat' }));
    await waitFor(() => expect(purchase).toHaveBeenCalledTimes(2));
    expect(purchase.mock.calls[1]).toEqual([
      'Lux',
      { priceShards: 450, economyVersion: 1, catalogVersion: 2 },
    ]);
  });

  it('traps keyboard focus and returns it to the purchase action on Escape', () => {
    renderPurchase();
    const buy = screen.getByRole('button', { name: /Acheter Lux/ });
    buy.focus();
    fireEvent.click(buy);
    const cancel = screen.getByRole('button', { name: 'Annuler' });
    const confirm = screen.getByRole('button', { name: 'Confirmer l’achat' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(buy).toHaveFocus();
  });

  it('invites guests to authenticate without exposing a wallet or issuing a purchase', async () => {
    const exitGuestMode = vi.fn(async () => ({ success: true }));
    const current = snapshot();
    current.wallet = null;
    useAuthStore.setState({ user: null, isGuest: true, exitGuestMode });
    useChampionEconomyStore.setState({ snapshot: current, userId: null });
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={<ChampionPurchaseAction championId="Lux" championName="Lux" />}
          />
          <Route path="/auth" element={<p>Authentication destination</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter pour acheter Lux' }));
    await screen.findByText('Authentication destination');
    expect(exitGuestMode).toHaveBeenCalledTimes(1);
    expect(purchase).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores a purchase response after switching accounts', async () => {
    let resolve!: (result: ChampionPurchaseResult) => void;
    purchase.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    renderPurchase();
    fireEvent.click(screen.getByRole('button', { name: /Acheter Lux/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’achat' }));
    act(() => useAuthStore.setState({ user: { id: 'other-account' } as User }));
    await act(async () =>
      resolve({
        replayed: false,
        snapshot: {
          ...snapshot(),
          wallet: { shardsBalance: 500, lifetimeEarned: 900, lifetimeSpent: 400 },
        },
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Lux est débloqué/)).not.toBeInTheDocument();
  });

  it('shows three permanent free plus five rotating champions and selectable access immediately after buying a locked champion', async () => {
    purchase.mockImplementation(async () => completePurchase());
    renderStarter();
    expect(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' })).toHaveValue(
      'available',
    );
    expect(screen.queryByRole('button', { name: 'Choisir Lux' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' }), {
      target: { value: 'all' },
    });
    expect(screen.getAllByText('Gratuit permanent')).toHaveLength(3);
    expect(screen.getAllByText('Rotation hebdomadaire')).toHaveLength(5);
    expect(screen.getAllByText('Verrouillé')).toHaveLength(2);
    const selectLux = screen.getByRole('button', { name: 'Choisir Lux' });
    expect(selectLux).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' }), {
      target: { value: 'locked' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Acheter Lux/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’achat' }));
    await waitFor(() => expect(selectLux).toBeEnabled());
    await waitFor(() => expect(selectLux).toHaveFocus());
    fireEvent.click(selectLux);
    expect(selectLux).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' })).toHaveValue(
      'all',
    );
  });

  it('leaves the six-champion Daily offer playable regardless of ownership', () => {
    useAuthStore.setState({ user: null, isGuest: true });
    const current = snapshot();
    current.wallet = null;
    useChampionEconomyStore.setState({ snapshot: current });
    renderStarter('/starter-select?mode=daily');
    const choices = screen.getAllByRole('button', { name: /^Choisir / });
    expect(choices).toHaveLength(6);
    for (const choice of choices) expect(choice).toBeEnabled();
    expect(
      screen.getByText(/Le défi quotidien garde son offre de six champions/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Filtrer les champions par accès' }),
    ).not.toBeInTheDocument();
  });

  it('keeps legacy selection and hides all economy controls when the flag is off', () => {
    useChampionEconomyStore.setState({ snapshot: { ...snapshot(), enabled: false } });
    renderStarter();
    expect(screen.getAllByRole('button', { name: /^Choisir / })).toHaveLength(6);
    expect(screen.queryByText('Éclats de champion')).not.toBeInTheDocument();
    expect(screen.queryByText('Verrouillé')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Filtrer les champions par accès' }),
    ).not.toBeInTheDocument();
  });

  it('blocks an online run while the access contract is missing and offers a localized refresh', () => {
    useChampionEconomyStore.setState({ snapshot: null, status: 'error' });
    renderStarter();
    for (const choice of screen.getAllByRole('button', { name: /^Choisir / }))
      expect(choice).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmer le choix' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Le catalogue ne peut pas être actualisé.');
    const calls = refresh.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refresh).toHaveBeenCalledTimes(calls + 1);
  });

  it('retries a frozen pending authority start even when the current catalog is unavailable', async () => {
    useChampionEconomyStore.setState({ snapshot: null, status: 'error' });
    const originalStart = useRunStore.getState().startRun;
    const startRun = vi.fn<typeof originalStart>(async () => ({
      success: false,
      code: 'start_failed',
      error: 'server_unavailable',
      retryable: true,
    }));
    useRunStore.setState({
      startRun,
      pendingAuthorityStart: {
        commandId: '44444444-4444-4444-8444-444444444444',
        ownerUserId: 'ui-user',
        mode: 'normal',
        team: ['Lux'],
        runeIds: ['press_the_attack'],
        difficulty: 'hard',
      },
    });
    try {
      renderStarter();
      const resume = screen.getByRole('button', { name: /reprendre la partie vérifiée/i });
      expect(resume).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Choisir Lux' })).toBeDisabled();
      fireEvent.click(resume);
      await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));
      expect(startRun.mock.calls[0][0]).toEqual(['Lux']);
      expect(useRunStore.getState().pendingAuthorityStart?.commandId).toBe(
        '44444444-4444-4444-8444-444444444444',
      );
    } finally {
      useRunStore.setState({ startRun: originalStart });
    }
  });

  it('preserves mastery Candies when purchasing through the database', async () => {
    purchase.mockImplementation(async () => completePurchase());
    useEnhancementStore.getState().setAvailableCandies(183);
    render(
      <MemoryRouter>
        <DatabasePage />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Lux' } });
    fireEvent.click(screen.getByRole('button', { name: /Lux.*Verrouillé/ }));
    expect(screen.getByRole('region', { name: 'Fiche de Lux' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Acheter Lux/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’achat' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useEnhancementStore.getState().availableCandies).toBe(183);
    expect(screen.getAllByText('Possédé')).toHaveLength(2);
  });

  it('limits database access filters to the playable catalog while retaining reference-only champions under All', () => {
    render(
      <MemoryRouter>
        <DatabasePage />
      </MemoryRouter>,
    );
    expect(screen.getByText('Katarina', { exact: true })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' }), {
      target: { value: 'locked' },
    });
    expect(screen.getByRole('button', { name: /Lux.*Verrouillé/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Warwick.*Verrouillé/ })).toBeInTheDocument();
    expect(document.querySelectorAll('button[id^="database-champion-"]')).toHaveLength(2);
    expect(screen.queryByText('Katarina', { exact: true })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' }), {
      target: { value: 'all' },
    });
    expect(screen.getByText('Katarina', { exact: true })).toBeInTheDocument();
  });

  it('keeps locked champion stats and spells available without enabling selection', () => {
    renderStarter();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' }), {
      target: { value: 'locked' },
    });
    const details = screen.getByRole('button', { name: 'Voir les statistiques et sorts de Lux' });
    details.focus();
    fireEvent.click(details);
    const dialog = screen.getByRole('dialog', { name: 'Voir les statistiques et sorts de Lux' });
    expect(within(dialog).getByRole('heading', { name: 'Lux' })).toBeInTheDocument();
    expect(dialog.querySelectorAll('.ability-card')).toHaveLength(5);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(details).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Choisir Lux' })).toBeDisabled();
  });

  it('removes an expired rotating selection using server time and refreshes the roster once', async () => {
    vi.useFakeTimers();
    try {
      const view = renderStarter();
      const selectDarius = screen.getByRole('button', { name: 'Choisir Darius' });
      fireEvent.click(selectDarius);
      expect(selectDarius).toHaveAttribute('aria-pressed', 'true');
      const initialRefreshes = refresh.mock.calls.length;
      serverNow = Date.parse(snapshot().rotation!.endsAt);
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.queryByRole('button', { name: 'Choisir Darius' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Retirer Darius de l’équipe' }),
      ).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer les champions par accès' }), {
        target: { value: 'all' },
      });
      expect(screen.getByRole('button', { name: 'Choisir Darius' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: 'Choisir Darius' })).toBeDisabled();
      expect(refresh).toHaveBeenCalledTimes(initialRefreshes + 1);
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(refresh).toHaveBeenCalledTimes(initialRefreshes + 1);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps bilingual content keys aligned and never hardcodes the catalog price in copy', () => {
    const french = getChampionEconomyContent('fr-FR');
    const english = getChampionEconomyContent('en-US');
    expect(Object.keys(english)).toEqual(Object.keys(french));
    expect(Object.keys(english.errors)).toEqual(Object.keys(french.errors));
    expect(english.buy('Lux', '450')).toBe('Buy Lux · 450 Shards');
    expect(french.buy('Lux', '450')).toBe('Acheter Lux · 450 Éclats');
  });
});
