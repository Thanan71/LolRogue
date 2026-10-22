// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { annie } from '@/data/champion/Annie';
import { garen } from '@/data/champion/Garen';
import {
  EnhancementTree,
  type EnhancementTreeProps,
} from '@/features/enhancements/ui/EnhancementTree';
import type { EnhancementResetPreview } from '@/services/interfaces/IEnhancementRepository';
import { useSettingsStore } from '@/stores/settingsStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function resetQuote(overrides: Partial<EnhancementResetPreview> = {}): EnhancementResetPreview {
  return {
    championId: 'Garen',
    revision: 2,
    catalogVersion: 4,
    contractSchemaVersion: 1,
    unlockedNodes: { fighter_core_1: 1, fighter_core_2: 1 },
    removedNodeIds: ['fighter_core_1', 'fighter_core_2'],
    actualSpend: 50,
    refundAmount: 50,
    feeAmount: 0,
    feeExempt: false,
    resetCount: 0,
    remainingCandies: 1_050,
    policyVersion: 1,
    eligible: true,
    historyUnavailable: false,
    reason: null,
    activeRunPreserved: true,
    ...overrides,
  };
}

function renderTree(overrides: Partial<EnhancementTreeProps> = {}) {
  const props: EnhancementTreeProps = {
    champion: garen,
    playerCandies: 1_000,
    masteryLevel: 4,
    enhancementState: { unlockedNodes: {}, totalCandiesSpent: 0 },
    onUnlockNode: vi.fn(async () => undefined),
    accountKey: 'account:A',
    enabledGates: { champion_specializations: false },
    ...overrides,
  };
  const view = render(
    <StrictMode>
      <EnhancementTree {...props} />
    </StrictMode>,
  );
  return {
    ...view,
    props,
    change: (next: Partial<EnhancementTreeProps>) =>
      view.rerender(
        <StrictMode>
          <EnhancementTree {...props} {...next} />
        </StrictMode>,
      ),
  };
}

const firstNode = () => document.getElementById('enhancement-fighter_core_1')!;
const unlock = () => within(firstNode()).getByRole('button', { name: 'Débloquer' });
const purchaseDialog = () => screen.getByRole('dialog', { name: 'Confirmer cet achat' });
const confirm = () =>
  within(purchaseDialog()).getByRole('button', { name: 'Dépenser les Candies' });

afterEach(() => useSettingsStore.setState({ language: 'fr-FR' }));

describe('TREE-08 enhancement purchase experience', () => {
  it('explores a path and projects stats without purchasing, then requires explicit confirmation', async () => {
    const user = userEvent.setup();
    const view = renderTree();
    await user.click(within(firstNode()).getByText('Effet, exemple et chemin'));
    expect(firstNode()).toHaveTextContent('Coût du chemin restant');
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
    await user.click(unlock());
    expect(purchaseDialog()).toHaveTextContent('Solde après achat: 980');
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
    await user.click(confirm());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.props.onUnlockNode).toHaveBeenCalledExactlyOnceWith('fighter_core_1');
  });

  it('starts on Cancel, traps Tab at both ends, closes on native cancel and restores the opener in StrictMode', async () => {
    const user = userEvent.setup();
    renderTree();
    const opener = unlock();
    await user.click(opener);
    const cancel = within(purchaseDialog()).getByRole('button', { name: 'Annuler' });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm()).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    // JSDOM has no native Escape-to-dialog-cancel behavior; Playwright presses real Escape.
    fireEvent(purchaseDialog(), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('allows one RPC for a double confirmation and keeps pending requests protected from cancellation', async () => {
    const pending = deferred<void>();
    const mutation = vi.fn(() => pending.promise);
    renderTree({ onUnlockNode: mutation });
    fireEvent.click(unlock());
    const button = confirm();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(within(purchaseDialog()).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    fireEvent(purchaseDialog(), new Event('cancel', { cancelable: true }));
    expect(purchaseDialog()).toBeInTheDocument();
    await act(async () => pending.resolve(undefined));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['account', 'champion'] as const)(
    'invalidates an open purchase confirmation after the %s changes',
    async (changed) => {
      const view = renderTree();
      fireEvent.click(unlock());
      const oldConfirmation = confirm();
      view.change(changed === 'account' ? { accountKey: 'account:B' } : { champion: annie });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.click(oldConfirmation);
      expect(view.props.onUnlockNode).not.toHaveBeenCalled();
    },
  );

  it('revalidates the wallet after opening a dialog instead of spending an obsolete balance', () => {
    const view = renderTree();
    fireEvent.click(unlock());
    view.change({ playerCandies: 0 });
    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
  });

  it('disables an already open confirmation when canonical loading fails', () => {
    const view = renderTree();
    fireEvent.click(unlock());
    view.change({ loadError: true });
    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
  });

  it('isolates in-flight purchases between accounts and ignores the former account completion', async () => {
    const oldRequest = deferred<void>();
    const newRequest = deferred<void>();
    const oldMutation = vi.fn(() => oldRequest.promise);
    const newMutation = vi.fn(() => newRequest.promise);
    const view = renderTree({ onUnlockNode: oldMutation });
    fireEvent.click(unlock());
    fireEvent.click(confirm());
    expect(oldMutation).toHaveBeenCalledTimes(1);
    view.change({ accountKey: 'account:B', onUnlockNode: newMutation });
    fireEvent.click(unlock());
    fireEvent.click(confirm());
    expect(newMutation).toHaveBeenCalledTimes(1);
    await act(async () => oldRequest.resolve(undefined));
    expect(purchaseDialog()).toBeInTheDocument();
    expect(confirm()).toBeDisabled();
    await act(async () => newRequest.resolve(undefined));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a failed confirmation open and retries only after another explicit action', async () => {
    const mutation = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    renderTree({ onUnlockNode: mutation });
    fireEvent.click(unlock());
    fireEvent.click(confirm());
    await waitFor(() =>
      expect(within(purchaseDialog()).getByRole('alert')).toHaveTextContent(
        'L’opération n’a pas abouti',
      ),
    );
    expect(mutation).toHaveBeenCalledTimes(1);
    fireEvent.click(confirm());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutation).toHaveBeenCalledTimes(2);
  });

  it('keeps guest exploration readable but rejects purchases and resets', async () => {
    const user = userEvent.setup();
    const previewReset = vi.fn(async () => resetQuote());
    const resetTree = vi.fn(async () => true);
    const view = renderTree({
      readOnly: true,
      accountKey: null,
      onPreviewReset: previewReset,
      onResetTree: resetTree,
    });
    expect(screen.getByText('Candies du compte').nextElementSibling).toHaveTextContent('—');
    expect(screen.getByText(/Connectez-vous pour dépenser/)).toBeVisible();
    expect(unlock()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Réinitialiser cet arbre' })).toBeDisabled();
    await user.click(within(firstNode()).getByText('Effet, exemple et chemin'));
    expect(firstNode().querySelector('details')).toHaveAttribute('open');
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
    expect(previewReset).not.toHaveBeenCalled();
    expect(resetTree).not.toHaveBeenCalled();
  });

  it('distinguishes closed specialization gates, exclusive paths and inactive historical ownership', async () => {
    const user = userEvent.setup();
    const view = renderTree();
    await user.click(screen.getByRole('tab', { name: /Rempart de Demacia/ }));
    const gated = document.getElementById('enhancement-garen_durability_1')!;
    expect(gated).toHaveTextContent('Validation d’équilibrage en attente');
    expect(within(gated).getByRole('button', { name: 'Débloquer' })).toBeDisabled();
    view.change({
      enabledGates: { champion_specializations: true },
      enhancementState: { unlockedNodes: { garen_execution_1: 1 }, totalCandiesSpent: 80 },
    });
    expect(gated).toHaveTextContent('Voie incompatible');
    expect(within(gated).getByRole('button', { name: 'Débloquer' })).toBeDisabled();
    view.change({
      champion: { ...garen, tags: ['Fighter'] },
      enhancementState: {
        unlockedNodes: { fighter_duelist_1: 1, fighter_duelist_2: 1 },
        totalCandiesSpent: 130,
      },
    });
    await user.click(screen.getByRole('tab', { name: /Duelliste/ }));
    expect(document.getElementById('enhancement-fighter_duelist_2')).toHaveTextContent(
      'Aucun rang actif',
    );
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
  });

  it('supports load retry and keyboard branch navigation without automatically purchasing a recommendation', async () => {
    const user = userEvent.setup();
    const retry = vi.fn(async () => undefined);
    const view = renderTree({ loadError: true, onRetry: retry });
    expect(unlock()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.change({ loadError: false });
    const firstTab = screen.getAllByRole('tab')[0];
    firstTab.focus();
    await user.keyboard('{End}');
    expect(screen.getAllByRole('tab')[screen.getAllByRole('tab').length - 1]).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Home}');
    expect(firstTab).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Voir le prochain achat possible' }));
    await waitFor(() => expect(firstNode()).toHaveFocus());
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
  });

  it('renders the complete English purchase confirmation without French fallback', async () => {
    useSettingsStore.setState({ language: 'en-US' });
    const view = renderTree();
    const core = document.getElementById('enhancement-fighter_core_1')!;
    fireEvent.click(within(core).getByRole('button', { name: 'Unlock' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm this purchase' });
    expect(dialog).toHaveTextContent('Balance after purchase: 980');
    expect(dialog).not.toHaveTextContent('Solde après achat');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(view.props.onUnlockNode).not.toHaveBeenCalled();
  });
});

describe('TREE-08 audited reset confirmation', () => {
  it('loads a server quote and displays attested refund/fee/remaining balance before any mutation', async () => {
    const quote = vi.fn(async () =>
      resetQuote({
        actualSpend: 200,
        refundAmount: 180,
        feeAmount: 20,
        resetCount: 4,
        remainingCandies: 1_180,
      }),
    );
    const reset = vi.fn(async () => true);
    renderTree({ onPreviewReset: quote, onResetTree: reset });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser cet arbre' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vérifier le remboursement' });
    await waitFor(() =>
      expect(within(dialog).getByText('Candies remboursées').nextElementSibling).toHaveTextContent(
        '180',
      ),
    );
    expect(within(dialog).getByText('Frais de reset').nextElementSibling).toHaveTextContent('20');
    expect(
      within(dialog).getByText('Solde final').nextElementSibling?.textContent?.replace(/\s/g, ''),
    ).toBe('1180');
    expect(dialog).toHaveTextContent('Nœuds retirés: 2');
    expect(quote).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Réinitialiser et rembourser' }));
    await waitFor(() => expect(reset).toHaveBeenCalledExactlyOnceWith(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not invent a refundable purchase for an empty tree or an unverifiable history', async () => {
    const reset = vi.fn(async () => true);
    renderTree({
      onPreviewReset: async () =>
        resetQuote({
          unlockedNodes: {},
          removedNodeIds: [],
          actualSpend: 0,
          refundAmount: 0,
          remainingCandies: 1_000,
          eligible: false,
          reason: 'tree_empty',
        }),
      onResetTree: reset,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser cet arbre' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vérifier le remboursement' });
    await waitFor(() =>
      expect(within(dialog).getByText('Candies remboursées').nextElementSibling).toHaveTextContent(
        '0',
      ),
    );
    expect(dialog).toHaveTextContent('Nœuds retirés: 0');
    expect(
      within(dialog).getByRole('button', { name: 'Réinitialiser et rembourser' }),
    ).toBeDisabled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('runs one reset request for a double click and preserves the pending dialog', async () => {
    const pending = deferred<boolean>();
    const reset = vi.fn(() => pending.promise);
    renderTree({ onPreviewReset: async () => resetQuote(), onResetTree: reset });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser cet arbre' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vérifier le remboursement' });
    const button = within(dialog).getByRole('button', { name: 'Réinitialiser et rembourser' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => pending.resolve(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['account', 'champion'] as const)(
    'discards a pending reset quote after the %s changes',
    async (changed) => {
      const pending = deferred<EnhancementResetPreview | null>();
      const reset = vi.fn(async () => true);
      const view = renderTree({ onPreviewReset: () => pending.promise, onResetTree: reset });
      fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser cet arbre' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('Calcul du remboursement serveur');
      view.change(changed === 'account' ? { accountKey: 'account:B' } : { champion: annie });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async () => pending.resolve(resetQuote()));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(reset).not.toHaveBeenCalled();
    },
  );

  it('requires a fresh quote after a rejected reset and retries preview explicitly', async () => {
    const quote = vi.fn(async () => resetQuote());
    const reset = vi.fn(async () => false);
    renderTree({ onPreviewReset: quote, onResetTree: reset });
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser cet arbre' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vérifier le remboursement' });
    const button = within(dialog).getByRole('button', { name: 'Réinitialiser et rembourser' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeInTheDocument());
    expect(button).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(quote).toHaveBeenCalledTimes(2);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
