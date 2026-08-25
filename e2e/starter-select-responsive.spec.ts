import { expect, type Page, test } from '@playwright/test';

const MOBILE_VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
] as const;

test.use({ hasTouch: true });

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function openStarterSelection(page: Page) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  await expect(page).toHaveURL('/starter-select');
  await expect(page.getByRole('heading', { name: 'Compose ton équipe' })).toBeVisible();
}

async function expectResponsiveStarterLayout(page: Page) {
  const layout = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.starter-select');
    const cards = [...document.querySelectorAll<HTMLElement>('.champion-card')];
    const runeDescriptions = [
      ...document.querySelectorAll<HTMLElement>('.starter-rune__description'),
    ];
    const actions = document.querySelector<HTMLElement>('.starter-select__actions');
    const confirm = document.querySelector<HTMLButtonElement>('.starter-select__confirm');
    const back = document.querySelector<HTMLButtonElement>('.starter-select__back');
    const lastRune = document.querySelector<HTMLElement>('.starter-rune:last-child');
    const journey = document.querySelector<HTMLElement>('.starter-select__journey');
    const runeIcon = document.querySelector<HTMLElement>('.starter-rune__icon');
    if (
      !root ||
      cards.length < 2 ||
      runeDescriptions.length === 0 ||
      !actions ||
      !confirm ||
      !back ||
      !lastRune ||
      !journey ||
      !runeIcon
    ) {
      throw new Error('Starter selection layout is incomplete.');
    }

    const [firstCardElement, secondCardElement] = cards;
    if (!firstCardElement || !secondCardElement) {
      throw new Error('Starter selection requires at least two champion cards.');
    }
    const firstCard = firstCardElement.getBoundingClientRect();
    const secondCard = secondCardElement.getBoundingClientRect();
    const narrowestDescription = Math.min(
      ...runeDescriptions.map((description) => description.getBoundingClientRect().width),
    );
    const confirmRect = confirm.getBoundingClientRect();
    const lastRuneRect = lastRune.getBoundingClientRect();
    const backRect = back.getBoundingClientRect();
    const journeyRect = journey.getBoundingClientRect();
    const runeIconRect = runeIcon.getBoundingClientRect();

    return {
      rootPosition: getComputedStyle(root).position,
      actionsDirection: getComputedStyle(actions).flexDirection,
      cardsShareFirstRow: Math.abs(firstCard.top - secondCard.top) <= 1,
      cardWidth: firstCard.width,
      narrowestDescription,
      confirmHeight: confirmRect.height,
      backHeight: backRect.height,
      backBorderStyle: getComputedStyle(back).borderStyle,
      journeyDisplay: getComputedStyle(journey).display,
      journeyHeight: journeyRect.height,
      runeIconWidth: runeIconRect.width,
      descriptionsAreUnclamped: runeDescriptions.every(
        (description) => getComputedStyle(description).webkitLineClamp === 'none',
      ),
      actionGap: confirmRect.top - lastRuneRect.bottom,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      documentHeight: document.documentElement.scrollHeight,
    };
  });

  expect(layout.rootPosition).not.toBe('fixed');
  expect(layout.actionsDirection).toBe('column');
  expect(layout.cardsShareFirstRow).toBe(true);
  expect(layout.cardWidth).toBeGreaterThanOrEqual(130);
  expect(layout.narrowestDescription).toBeGreaterThanOrEqual(180);
  expect(layout.confirmHeight).toBeGreaterThanOrEqual(44);
  expect(layout.confirmHeight).toBeLessThanOrEqual(56);
  expect(layout.backHeight).toBeGreaterThanOrEqual(44);
  expect(layout.backBorderStyle).not.toBe('none');
  expect(layout.journeyDisplay).not.toBe('none');
  expect(layout.journeyHeight).toBeGreaterThan(20);
  expect(layout.runeIconWidth).toBeGreaterThanOrEqual(32);
  expect(layout.descriptionsAreUnclamped).toBe(true);
  expect(layout.actionGap).toBeGreaterThan(8);
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
  // Full rune effects are intentionally not line-clamped on mobile. Keep the
  // flow bounded without hiding rule text from the player.
  expect(layout.documentHeight).toBeLessThan(2_200);
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`starter and rune layout stays readable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStarterSelection(page);
    await expectResponsiveStarterLayout(page);
    const images = page.locator('.champion-card__splash');
    for (let index = 0; index < (await images.count()); index++) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async (element) => {
        if (element instanceof HTMLImageElement && !element.complete) {
          await new Promise<void>((resolve) => {
            element.addEventListener('load', () => resolve(), { once: true });
            element.addEventListener('error', () => resolve(), { once: true });
          });
        }
      });
    }
    await page.evaluate(() => window.scrollTo(0, 0));

    await testInfo.attach(`starter-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}

test('the complete selection can be performed with the keyboard at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openStarterSelection(page);

  const champions = page.getByRole('button', { name: /^Choisir / });
  const firstChampion = champions.nth(0);
  const secondChampion = champions.nth(1);
  await firstChampion.press('Enter');
  await secondChampion.press('Enter');
  await expect(firstChampion).toHaveAttribute('aria-pressed', 'true');
  await expect(secondChampion).toHaveAttribute('aria-pressed', 'true');

  const confirm = page.getByRole('button', { name: 'Confirmer le choix' });
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await expect(confirm).toBeEnabled();

  const runes = page.getByRole('checkbox');
  const firstRune = runes.nth(0);
  await firstRune.focus();
  await page.keyboard.press('Space');
  await expect(firstRune).toBeChecked();
  await expect(page.getByText('1/3 sélectionnées')).toBeVisible();

  await runes.nth(1).focus();
  await page.keyboard.press('Space');
  await runes.nth(2).focus();
  await page.keyboard.press('Space');
  await expect(runes.nth(3)).toBeDisabled();

  await firstRune.focus();
  await page.keyboard.press('Space');
  await expect(runes.nth(3)).toBeEnabled();

  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/run');
});

test('a missing rune image keeps a visible themed fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStarterSelection(page);

  const firstIcon = page.locator('.starter-rune__icon').first();
  const image = firstIcon.locator('img');
  await image.evaluate((element) => element.dispatchEvent(new Event('error')));

  await expect(image).toBeHidden();
  await expect(firstIcon.locator('.starter-rune__icon-fallback')).toBeVisible();
});

test('touch selection exposes a start error without overlap at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openStarterSelection(page);

  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    useRunStore.setState({
      startRun: async () => ({
        success: false,
        code: 'start_failed',
        error: 'La run de test est temporairement indisponible.',
        retryable: true,
      }),
    });
  });

  const champions = page.getByRole('button', { name: /^Choisir / });
  const firstChampion = champions.nth(0);
  const secondChampion = champions.nth(1);
  await firstChampion.tap();
  await secondChampion.tap();
  await expect(firstChampion).toHaveAttribute('aria-pressed', 'true');
  await expect(secondChampion).toHaveAttribute('aria-pressed', 'true');

  const confirm = page.getByRole('button', { name: 'Confirmer le choix' });
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await expect(confirm).toBeEnabled();

  await page.getByRole('checkbox').first().tap();
  await confirm.tap();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('La run de test est temporairement indisponible.');
  await expect(page).toHaveURL('/starter-select');

  const geometry = await page.evaluate(() => {
    const alert = document.querySelector<HTMLElement>('.starter-select__error');
    const confirm = document.querySelector<HTMLElement>('.starter-select__confirm');
    if (!alert || !confirm) throw new Error('Error feedback is incomplete.');
    const alertRect = alert.getBoundingClientRect();
    const confirmRect = confirm.getBoundingClientRect();
    return {
      alertWidth: alertRect.width,
      gap: confirmRect.top - alertRect.bottom,
      confirmHeight: confirmRect.height,
    };
  });

  expect(geometry.alertWidth).toBeGreaterThan(250);
  expect(geometry.gap).toBeGreaterThan(8);
  expect(geometry.confirmHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.confirmHeight).toBeLessThanOrEqual(56);
});

test('touch selection and Back remain activatable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStarterSelection(page);

  const champions = page.getByRole('button', { name: /^Choisir / });
  const firstChampion = champions.nth(0);
  const secondChampion = champions.nth(1);
  await firstChampion.tap();
  await secondChampion.tap();
  await expect(firstChampion).toHaveAttribute('aria-pressed', 'true');
  await expect(secondChampion).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox').first().tap();
  await expect(page.getByRole('checkbox').first()).toBeChecked();

  const confirm = page.getByRole('button', { name: 'Confirmer le choix' });
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await expect(confirm).toBeEnabled();

  const back = page.getByRole('button', { name: '← Retour' });
  await back.scrollIntoViewIfNeeded();
  await back.tap();
  await expect(page).toHaveURL('/');

  await page.getByRole('button', { name: 'Jouer', exact: true }).tap();
  await expect(page).toHaveURL('/starter-select');
  const returnChampions = page.getByRole('button', { name: /^Choisir / });
  await returnChampions.nth(0).tap();
  await returnChampions.nth(1).tap();
  await expect(returnChampions.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(returnChampions.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox').first().tap();
  const returnConfirm = page.getByRole('button', { name: 'Confirmer le choix' });
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await expect(returnConfirm).toBeEnabled();
  await returnConfirm.tap();
  await expect(page).toHaveURL('/run');
});
