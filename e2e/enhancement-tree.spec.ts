import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { browserZoomContext } from './helpers/admin-browser-zoom';

declare global {
  interface Window {
    __enhancementUiFixture: { purchases: string[]; resets: number[]; quotes: number };
  }
}

/** Presentation fixtures only. Database tests separately prove real permissions and debits. */
async function enterEnhancements(page: Page, language: 'fr-FR' | 'en-US', guest = false) {
  await page.addInitScript((selected) => {
    localStorage.clear();
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: selected } }));
  }, language);
  // No UI fixture sends account mutations to a remote Supabase project.
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/functions/v1/**', (route) => route.abort());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/auth');
  await page
    .getByRole('button', {
      name: language === 'en-US' ? 'Play as guest' : 'Jouer en invité',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL('/');
  await page.evaluate(
    async ({ guest }) => {
      const [{ useAuthStore }, { useEnhancementStore }, { useChampionEconomyStore }] =
        await Promise.all([
          import('/src/stores/authStore.ts'),
          import('/src/stores/enhancementStore.ts'),
          import('/src/stores/championEconomyStore.ts'),
        ]);
      const account = '00000000-0000-4000-8000-000000000088';
      window.__enhancementUiFixture = { purchases: [], resets: [], quotes: 0 };
      useChampionEconomyStore.setState({
        refresh: async () => undefined,
        snapshot: null,
        status: 'ready',
        error: null,
      });
      useEnhancementStore.setState({
        ownerUserId: guest ? null : account,
        isInitialized: true,
        isLoading: false,
        error: null,
        contractError: null,
        statusMessage: null,
        availableCandies: 1_000,
        enhancements: {
          Garen: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 0, resetCount: 0 },
        },
        championMasteryLevels: { Garen: 4 },
        contractState: {
          catalogVersion: 4,
          contractSchemaVersion: 1,
          enabledGates: { champion_specializations: false },
          repeatResetFeeBasisPoints: 0,
          resetPolicyVersion: 1,
        },
        initialize: async () => undefined,
        loadContract: async () => undefined,
        retryLoad: async () => undefined,
        unlockNode: async (nodeId) => {
          window.__enhancementUiFixture.purchases.push(nodeId);
          const current = useEnhancementStore.getState();
          const previous = current.enhancements.Garen;
          const balance = current.availableCandies - 20;
          useEnhancementStore.setState({
            availableCandies: balance,
            enhancements: {
              Garen: {
                ...previous,
                unlockedNodes: { ...previous.unlockedNodes, [nodeId]: 1 },
                totalCandiesSpent: previous.totalCandiesSpent + 20,
                revision: (previous.revision ?? 0) + 1,
              },
            },
          });
          useAuthStore.getState().setPlayerCandyBalance(balance);
          return true;
        },
        previewReset: async () => {
          window.__enhancementUiFixture.quotes++;
          const current = useEnhancementStore.getState();
          const state = current.enhancements.Garen;
          const removedNodeIds = Object.keys(state.unlockedNodes);
          return {
            championId: 'Garen',
            revision: state.revision ?? 0,
            catalogVersion: 4,
            contractSchemaVersion: 1,
            unlockedNodes: state.unlockedNodes,
            removedNodeIds,
            actualSpend: state.totalCandiesSpent,
            refundAmount: state.totalCandiesSpent,
            feeAmount: 0,
            feeExempt: false,
            resetCount: state.resetCount ?? 0,
            remainingCandies: current.availableCandies + state.totalCandiesSpent,
            policyVersion: 1,
            eligible: removedNodeIds.length > 0,
            historyUnavailable: false,
            reason: removedNodeIds.length ? null : 'tree_empty',
            activeRunPreserved: true,
          };
        },
        resetTree: async (revision) => {
          window.__enhancementUiFixture.resets.push(revision);
          const current = useEnhancementStore.getState();
          const state = current.enhancements.Garen;
          if (revision !== state.revision) return false;
          const balance = current.availableCandies + state.totalCandiesSpent;
          useEnhancementStore.setState({
            availableCandies: balance,
            enhancements: {
              Garen: {
                unlockedNodes: {},
                totalCandiesSpent: 0,
                revision: revision + 1,
                resetCount: (state.resetCount ?? 0) + 1,
              },
            },
          });
          useAuthStore.getState().setPlayerCandyBalance(balance);
          return true;
        },
      });
      if (!guest)
        useAuthStore.setState({
          user: { id: account } as NonNullable<ReturnType<typeof useAuthStore.getState>['user']>,
          isGuest: false,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
          authStatus: 'ready',
          player: {
            id: account,
            username: 'enhancement-ui-fixture',
            display_name: 'Enhancement UI fixture',
            total_candies: 1_000,
            is_admin: false,
            level: 1,
            total_runs_completed: 0,
            total_wins: 0,
          } as NonNullable<ReturnType<typeof useAuthStore.getState>['player']>,
        });
      history.pushState(null, '', '/database');
      dispatchEvent(new PopStateEvent('popstate'));
    },
    { guest },
  );
  await expect(page).toHaveURL('/database');
  await page.locator('#champion-search').fill('Garen');
  await page.locator('#database-champion-Garen').click();
  await page
    .getByRole('tab', { name: language === 'en-US' ? /Enhancements/ : /Améliorations/ })
    .click();
  await expect(page.locator('.enhancement-tree')).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

for (const language of ['fr-FR', 'en-US'] as const) {
  const english = language === 'en-US';
  test(`${language}: 320px purchase confirmation, keyboard focus, reset quote and visible states`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await enterEnhancements(page, language);
    const tree = page.locator('.enhancement-tree');
    const first = page.locator('#enhancement-fighter_core_1');
    await first
      .getByText(english ? 'Effect, example and path' : 'Effet, exemple et chemin', { exact: true })
      .click();
    await expect(first).toContainText(english ? 'Remaining path cost' : 'Coût du chemin restant');
    expect(await page.evaluate(() => window.__enhancementUiFixture.purchases)).toEqual([]);
    const unlock = first.getByRole('button', {
      name: english ? 'Unlock' : 'Débloquer',
      exact: true,
    });
    await unlock.focus();
    await unlock.press('Enter');
    let dialog = page.getByRole('dialog', {
      name: english ? 'Confirm this purchase' : 'Confirmer cet achat',
    });
    const cancel = dialog.getByRole('button', {
      name: english ? 'Cancel' : 'Annuler',
      exact: true,
    });
    const confirm = dialog.getByRole('button', {
      name: english ? 'Spend Candies' : 'Dépenser les Candies',
      exact: true,
    });
    await expect(cancel).toBeFocused();
    await cancel.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await confirm.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(unlock).toBeFocused();
    expect(await page.evaluate(() => window.__enhancementUiFixture.purchases)).toEqual([]);
    await unlock.press('Enter');
    await confirm.click();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => window.__enhancementUiFixture.purchases)).toEqual([
      'fighter_core_1',
    ]);
    await expect(first).toContainText(english ? 'Purchased' : 'Acheté');
    await tree
      .getByRole('tab', { name: english ? /Demacian Bulwark/ : /Rempart de Demacia/ })
      .click();
    await expect(page.locator('#enhancement-garen_durability_1')).toContainText(
      english ? 'Awaiting balance validation' : 'Validation d’équilibrage en attente',
    );
    await tree
      .getByRole('button', {
        name: english ? 'Reset this tree' : 'Réinitialiser cet arbre',
        exact: true,
      })
      .click();
    dialog = page.getByRole('dialog', {
      name: english ? 'Review the refund' : 'Vérifier le remboursement',
    });
    await expect(dialog).toContainText(english ? 'Candies refunded' : 'Candies remboursées');
    expect(await page.evaluate(() => window.__enhancementUiFixture.resets)).toEqual([]);
    await dialog
      .getByRole('button', { name: english ? 'Reset and refund' : 'Réinitialiser et rembourser' })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => window.__enhancementUiFixture.resets)).toEqual([1]);
    await noOverflow(page);
    const audit = await new AxeBuilder({ page })
      .include('.enhancement-tree')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    const screenshot = info.outputPath(`enhancement-mobile-${language}.png`);
    await tree.screenshot({ path: screenshot });
    await info.attach(`enhancement-mobile-${language}`, {
      path: screenshot,
      contentType: 'image/png',
    });
  });

  test(`${language}: native Chromium 200% and 400% zoom keeps purchase dialogs usable`, async ({
    baseURL,
  }, info) => {
    test.setTimeout(90_000);
    const zoomed = await browserZoomContext(baseURL!);
    try {
      const page = await zoomed.context.newPage();
      page.setDefaultTimeout(20_000);
      await enterEnhancements(page, language);
      for (const factor of [2, 4] as const) {
        const evidence = await zoomed.setZoom(page, factor);
        const metricsPath = info.outputPath(
          `enhancement-browser-zoom-${language}-${factor * 100}.json`,
        );
        await writeFile(metricsPath, JSON.stringify(evidence, null, 2));
        await info.attach(`enhancement-browser-zoom-${language}-${factor * 100}`, {
          path: metricsPath,
          contentType: 'application/json',
        });
        const opener = page
          .locator('#enhancement-fighter_core_1')
          .getByRole('button', { name: english ? 'Unlock' : 'Débloquer', exact: true });
        await opener.focus();
        await opener.press('Enter');
        const dialog = page.getByRole('dialog', {
          name: english ? 'Confirm this purchase' : 'Confirmer cet achat',
        });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole('button', { name: english ? 'Cancel' : 'Annuler', exact: true }),
        ).toBeFocused();
        await noOverflow(page);
        const audit = await new AxeBuilder({ page })
          .include('.enhancement-dialog')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(audit.violations).toEqual([]);
        const screenshot = info.outputPath(`enhancement-real-zoom-${language}-${factor * 100}.png`);
        await zoomed.screenshot(page, screenshot);
        await info.attach(`enhancement-real-zoom-${language}-${factor * 100}`, {
          path: screenshot,
          contentType: 'image/png',
        });
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
        await expect(opener).toBeFocused();
      }
      expect(await page.evaluate(() => window.__enhancementUiFixture.purchases)).toEqual([]);
    } finally {
      await zoomed.close();
    }
  });
}

test('guest tree remains exploratory at 320px with all purchase and reset actions disabled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await enterEnhancements(page, 'fr-FR', true);
  const tree = page.locator('.enhancement-tree');
  await expect(tree).toContainText('Connectez-vous pour dépenser des Candies');
  await expect(
    page
      .locator('#enhancement-fighter_core_1')
      .getByRole('button', { name: 'Débloquer', exact: true }),
  ).toBeDisabled();
  await expect(
    tree.getByRole('button', { name: 'Réinitialiser cet arbre', exact: true }),
  ).toBeDisabled();
  await page
    .locator('#enhancement-fighter_core_1')
    .getByText('Effet, exemple et chemin', { exact: true })
    .click();
  await expect(page.locator('#enhancement-fighter_core_1 details')).toHaveAttribute('open');
  expect(await page.evaluate(() => window.__enhancementUiFixture)).toEqual({
    purchases: [],
    resets: [],
    quotes: 0,
  });
  await noOverflow(page);
});
