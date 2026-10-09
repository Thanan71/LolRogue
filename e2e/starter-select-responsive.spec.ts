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

async function openRunes(page: Page, keyboard = false) {
  const disclosure = page.locator('.starter-select__rune-disclosure');
  const summary = disclosure.locator('summary');
  await expect(disclosure).not.toHaveAttribute('open');
  if (keyboard) {
    await summary.focus();
    await page.keyboard.press('Enter');
  } else {
    await summary.tap();
  }
  await expect(disclosure).toHaveAttribute('open');
  await expect(page.getByRole('checkbox').first()).toBeAttached();
}

async function expectResponsiveStarterLayout(page: Page, expandedRunes = false) {
  const layout = await page.evaluate((runesExpanded) => {
    const root = document.querySelector<HTMLElement>('.starter-select');
    const cards = [...document.querySelectorAll<HTMLElement>('.champion-card')];
    const runeDescriptions = [
      ...document.querySelectorAll<HTMLElement>('.starter-rune__description'),
    ];
    const actions = document.querySelector<HTMLElement>('.starter-select__actions');
    const confirm = document.querySelector<HTMLButtonElement>('.starter-select__confirm');
    const back = document.querySelector<HTMLButtonElement>('.starter-select__back');
    const journey = document.querySelector<HTMLElement>('.starter-select__journey');
    const runeIcon = document.querySelector<HTMLElement>('.starter-rune__icon');
    const runeDisclosure = document.querySelector<HTMLDetailsElement>(
      '.starter-select__rune-disclosure',
    );
    const footer = document.querySelector<HTMLElement>('.starter-select__action-footer');
    if (
      !root ||
      cards.length < 2 ||
      runeDescriptions.length === 0 ||
      !actions ||
      !confirm ||
      !back ||
      !journey ||
      !runeIcon ||
      !runeDisclosure ||
      !footer
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
      runesExpanded: runeDisclosure.open,
      expectedRunesExpanded: runesExpanded,
      footerPosition: getComputedStyle(footer).position,
      confirmTop: confirmRect.top,
      confirmBottom: confirmRect.bottom,
      confirmLeft: confirmRect.left,
      confirmRight: confirmRect.right,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      confirmIsUncovered:
        document.elementFromPoint(
          confirmRect.left + confirmRect.width / 2,
          confirmRect.top + confirmRect.height / 2,
        ) === confirm,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      documentHeight: document.documentElement.scrollHeight,
    };
  }, expandedRunes);

  expect(layout.rootPosition).not.toBe('fixed');
  expect(layout.actionsDirection).toBe('column');
  expect(layout.cardsShareFirstRow).toBe(true);
  expect(layout.cardWidth).toBeGreaterThanOrEqual(130);
  expect(layout.confirmHeight).toBeGreaterThanOrEqual(44);
  expect(layout.confirmHeight).toBeLessThanOrEqual(56);
  expect(layout.backHeight).toBeGreaterThanOrEqual(44);
  expect(layout.backBorderStyle).not.toBe('none');
  expect(layout.journeyDisplay).not.toBe('none');
  expect(layout.journeyHeight).toBeGreaterThan(20);
  expect(layout.runesExpanded).toBe(layout.expectedRunesExpanded);
  if (expandedRunes) {
    expect(layout.narrowestDescription).toBeGreaterThanOrEqual(180);
    expect(layout.runeIconWidth).toBeGreaterThanOrEqual(32);
    expect(layout.descriptionsAreUnclamped).toBe(true);
  } else {
    expect(layout.documentHeight).toBeLessThan(2_200);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  }
  expect(layout.footerPosition).toBe('fixed');
  expect(layout.confirmTop).toBeGreaterThanOrEqual(0);
  expect(layout.confirmBottom).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.confirmLeft).toBeGreaterThanOrEqual(0);
  expect(layout.confirmRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.confirmIsUncovered).toBe(true);
  await expect(page.locator('.starter-select__confirm')).toBeInViewport({ ratio: 1 });
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`starter and rune layout stays readable at ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStarterSelection(page);
    await expectResponsiveStarterLayout(page);
    await openRunes(page);
    await expectResponsiveStarterLayout(page, true);
    await page.locator('.starter-rune').last().scrollIntoViewIfNeeded();
    await expectResponsiveStarterLayout(page, true);
    await page.locator('.starter-select__rune-disclosure summary').tap();
    await expect(page.locator('.starter-select__rune-disclosure')).not.toHaveAttribute('open');
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

  await openRunes(page, true);
  const runes = page.getByRole('checkbox');
  const firstRune = runes.nth(0);
  await firstRune.focus();
  await page.keyboard.press('Space');
  await expect(firstRune).toBeChecked();
  await expect(page.locator('.starter-select__rune-disclosure summary')).toContainText(
    '1/3 sélectionnée',
  );

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
  await openRunes(page);

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

  // Runes remain optional when starting and when an error must be announced.
  await expect(page.locator('.starter-select__rune-disclosure')).not.toHaveAttribute('open');
  await confirm.tap();

  const alert = page.getByRole('alert');
  await expect(alert).toHaveText('La partie vérifiée n’a pas pu démarrer.');
  await expect(page).toHaveURL('/starter-select');
  await expect(alert).toBeInViewport({ ratio: 1 });
  await expect(confirm).toBeInViewport({ ratio: 1 });

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
      alertTop: alertRect.top,
      confirmBottom: confirmRect.bottom,
      viewportHeight: innerHeight,
      confirmIsUncovered:
        document.elementFromPoint(
          confirmRect.left + confirmRect.width / 2,
          confirmRect.top + confirmRect.height / 2,
        ) === confirm,
    };
  });

  expect(geometry.alertWidth).toBeGreaterThan(250);
  expect(geometry.gap).toBeGreaterThanOrEqual(0);
  expect(geometry.confirmHeight).toBeGreaterThanOrEqual(44);
  expect(geometry.confirmHeight).toBeLessThanOrEqual(56);
  expect(geometry.alertTop).toBeGreaterThanOrEqual(0);
  expect(geometry.confirmBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.confirmIsUncovered).toBe(true);
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
  await openRunes(page);
  await page.locator('.starter-rune').first().tap();
  await expect(page.getByRole('checkbox').first()).toBeChecked();

  const confirm = page.getByRole('button', { name: 'Confirmer le choix' });
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await expect(confirm).toBeEnabled();

  const back = page.getByRole('button', { name: 'Retour', exact: true });
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
  await expect(page.locator('.starter-select__rune-disclosure')).not.toHaveAttribute('open');
  const returnConfirm = page.getByRole('button', { name: 'Confirmer le choix' });
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await expect(returnConfirm).toBeEnabled();
  await returnConfirm.tap();
  await expect(page).toHaveURL('/run');
  expect(
    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      return useRunStore.getState().runeIds;
    }),
  ).toEqual([]);
});
