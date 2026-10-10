import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

/** Presentation-only fixtures; connected-champion-economy covers actual authority and persistence. */
async function installEconomyUi(page: Page, english: boolean) {
  await page.goto('/auth');
  if (english) {
    await Promise.all([page.waitForEvent('load'), page.getByLabel('Langue').selectOption('en-US')]);
  }
  await page.getByRole('button', { name: english ? 'Play as guest' : 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'LoL Rogue', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const [
      { useAuthStore },
      { useChampionEconomyStore },
      { CHAMPION_ECONOMY_CATALOG, getChampionAccess },
    ] = await Promise.all([
      import('/src/stores/authStore.ts'),
      import('/src/stores/championEconomyStore.ts'),
      import('/src/domain/championEconomy.ts'),
    ]);
    await useChampionEconomyStore.getState().refresh();
    const clock = Date.parse('2026-10-08T12:00:00.000Z');
    useAuthStore.setState({
      user: {
        id: 'economy-ui-fixture',
        email: 'fixture@example.test',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-10-08T12:00:00.000Z',
      },
      isGuest: false,
      isAuthenticated: true,
      authStatus: 'ready',
      isLoading: false,
      isInitialized: true,
    });
    useChampionEconomyStore.setState({
      userId: 'economy-ui-fixture',
      status: 'ready',
      error: null,
      purchasingChampionId: null,
      snapshot: {
        enabled: true,
        economyVersion: 1,
        catalogVersion: 2,
        gameplayRulesetVersion: 22,
        serverNow: new Date(clock).toISOString(),
        rotation: {
          id: '2026-W41-v1-r22',
          startsAt: '2026-10-05T00:00:00.000Z',
          endsAt: '2026-10-12T00:00:00.000Z',
          championIds: ['Darius', 'Jinx', 'Leona', 'Malphite', 'Soraka'],
          rulesetVersion: 22,
          algorithmVersion: 1,
        },
        catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
        wallet: { shardsBalance: 900, lifetimeEarned: 900, lifetimeSpent: 0 },
        ownedChampionIds: [],
        firstWinChampionIds: [],
      },
      getServerNow: () => clock,
      getAccess: (id: string) =>
        getChampionAccess(id, useChampionEconomyStore.getState().snapshot!, clock),
      refresh: async () => undefined,
      purchase: async (
        id: string,
        quote?: { priceShards: number; economyVersion: number; catalogVersion: number },
      ) => {
        const current = useChampionEconomyStore.getState().snapshot!;
        if (
          id !== 'Lux' ||
          quote?.priceShards !== 400 ||
          quote.economyVersion !== 1 ||
          quote.catalogVersion !== 2
        )
          throw new Error('unexpected_ui_fixture_purchase');
        const next = {
          ...current,
          ownedChampionIds: ['Lux'],
          wallet: { shardsBalance: 500, lifetimeEarned: 900, lifetimeSpent: 400 },
        };
        useChampionEconomyStore.setState({ snapshot: next });
        return { replayed: false, snapshot: next };
      },
    });
  });
  await page.getByRole('button', { name: english ? 'Play' : 'Jouer', exact: true }).click();
  await expect(page).toHaveURL('/starter-select');
}

for (const english of [false, true]) {
  test(`champion purchase is readable, keyboard accessible and immediately selectable on mobile (${english ? 'EN' : 'FR'})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 370, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installEconomyUi(page, english);
    const accessFilter = page.getByRole('combobox', {
      name: english ? 'Filter champions by access' : 'Filtrer les champions par accès',
    });
    await expect(accessFilter).toHaveValue('available');
    await expect(
      page.getByRole('button', { name: english ? 'Choose Lux' : 'Choisir Lux', exact: true }),
    ).toHaveCount(0);
    await accessFilter.selectOption('all');
    await page.getByRole('searchbox').fill('Lux');
    const choose = page.getByRole('button', {
      name: english ? 'Choose Lux' : 'Choisir Lux',
      exact: true,
    });
    await expect(choose).toBeDisabled();
    await expect(
      page.getByText(
        english
          ? 'The catalog could not be refreshed. Try again before starting a new run.'
          : 'Le catalogue ne peut pas être actualisé. Réessaie avant de lancer une nouvelle run.',
      ),
    ).toHaveCount(0);
    const details = page.getByRole('button', {
      name: english ? 'View Lux’s stats and abilities' : 'Voir les statistiques et sorts de Lux',
    });
    await details.focus();
    await page.keyboard.press('Enter');
    const preview = page.getByRole('dialog');
    await expect(preview.getByRole('heading', { name: 'Lux', exact: true })).toBeVisible();
    await expect(preview.locator('.ability-card')).toHaveCount(5);
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
    const buy = page.getByRole('button', {
      name: english ? 'Buy Lux · 400 Shards' : 'Acheter Lux · 400 Éclats',
    });
    await buy.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText(english ? '900 Shards' : '900 Éclats', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText(english ? '500 Shards' : '500 Éclats', { exact: true }),
    ).toBeVisible();
    const cancel = dialog.getByRole('button', {
      name: english ? 'Cancel' : 'Annuler',
      exact: true,
    });
    const confirm = dialog.getByRole('button', {
      name: english ? 'Confirm purchase' : 'Confirmer l’achat',
      exact: true,
    });
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .include('.ui-dialog')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(choose).toBeEnabled();
    await expect(choose).toBeFocused();
    await expect(
      page.getByRole('status').filter({
        hasText: english
          ? 'Lux is unlocked. Balance: 500 Shards.'
          : 'Lux est débloqué. Solde : 500 Éclats.',
      }),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(choose).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `test-results/champion-economy-${english ? 'en' : 'fr'}-mobile.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: english ? 'Back' : 'Retour', exact: true }).click();
    await page.getByRole('button', { name: 'Champions', exact: true }).click();
    await page.getByRole('searchbox').fill('Lux');
    const databaseChampion = page.locator('#database-champion-Lux');
    await databaseChampion.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#database-champion-detail')).toBeFocused();
    await expect(
      page
        .locator('#database-champion-detail')
        .getByText(english ? 'Owned' : 'Possédé', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('#database-champion-detail').locator('.ability-card')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('.database-detail-mobile-nav button').click();
    await expect(databaseChampion).toBeFocused();
    await page.screenshot({
      path: `test-results/champion-economy-database-${english ? 'en' : 'fr'}-mobile.png`,
      fullPage: true,
    });
  });
}
