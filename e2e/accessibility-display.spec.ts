import { expect, type Page, test } from '@playwright/test';

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
}

async function expectReflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    viewportWidth: document.documentElement.clientWidth,
    hasVisibleContent: Boolean(document.querySelector('main, h1')),
  }));
  expect(metrics.viewportWidth).toBe(640);
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.hasVisibleContent).toBe(true);
}

test('le mouvement réduit neutralise CSS, canvas, SVG et animation de combat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);

  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  await expect(page.locator('canvas')).toHaveCount(0);
  const menuMotion = await page.locator('.main-menu__logo-section').evaluate((element) => {
    const style = getComputedStyle(element);
    return { duration: style.animationDuration, iterations: style.animationIterationCount };
  });
  expect(Number.parseFloat(menuMotion.duration)).toBeLessThanOrEqual(0.00001);
  expect(menuMotion.iterations).toBe('1');

  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const started = await useRunStore.getState().startRun(['Annie', 'Ashe'], { seed: 20260801 });
    if (!started.success) throw new Error(`Unable to start reduced-motion run: ${started.code}`);
  });
  await page.goto('/run');
  await expect(page.locator('svg animate')).toHaveCount(0);
});

test('les réglages modifient leurs consommateurs réels', async ({ page }) => {
  await enterGuest(page);
  await page.getByRole('button', { name: 'Réglages' }).click();

  await page.getByLabel('Taille du texte').selectOption('large');
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
    .toBe('19.2px');

  await page.getByLabel(/^Volume des effets sonores — 80\s%$/).fill('35');
  await page.getByLabel('Vitesse du combat').selectOption('3');
  await page.locator('label.settings-toggle[for="particles"]').click();
  await expect(page.getByLabel('Particules')).not.toBeChecked();
  const settings = await page.evaluate(async () => {
    const { useAudioStore } = await import('/src/stores/audioStore.ts');
    const { useSettingsStore } = await import('/src/stores/settingsStore.ts');
    return {
      volume: useAudioStore.getState().sfxVolume,
      speed: useSettingsStore.getState().battleSpeed,
      particles: useSettingsStore.getState().particlesEnabled,
    };
  });
  expect(settings).toEqual({ volume: 35, speed: 3, particles: false });

  await page.getByRole('button', { name: 'Retour au menu' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('le zoom 200 % conserve un reflow horizontal sur les routes principales', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);
  await expectReflow(page);

  for (const [button, route] of [
    ['Champions', '/database'],
    ['Réglages', '/settings'],
    ['Crédits', '/credits'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page).toHaveURL(route);
    await expectReflow(page);
    await page
      .getByRole('button', { name: /Retour au menu/ })
      .or(page.getByRole('link', { name: /Retour au menu/ }))
      .first()
      .click();
  }
});

test('le mode Windows High Contrast conserve contrôles, état et focus', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/auth');
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

  const guest = page.getByRole('button', { name: 'Jouer en invité' });
  await guest.focus();
  const style = await guest.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { outline: computed.outlineStyle, border: computed.borderStyle };
  });
  expect(style.outline).not.toBe('none');
  expect(style.border).not.toBe('none');
  await expect(guest).toBeFocused();
  expect(await guest.ariaSnapshot()).toContain('button "Jouer en invité"');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'LoL Rogue' })).toBeVisible();
});

test('les cartes restent lisibles sous leurs actions en contraste forcé', async ({ page }) => {
  const transparentColor = /^rgba\(\d+,\s*\d+,\s*\d+,\s*0\)$/;
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/auth');
  await expect(page.getByRole('button', { name: 'Jouer en invité' })).not.toHaveCSS(
    'background-color',
    transparentColor,
  );
  await enterGuest(page);

  async function expectUncoveredCardActions(selector: string) {
    const actions = page.locator(selector);
    await expect(actions.first()).toBeVisible();
    const count = await actions.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(actions.nth(index)).toHaveCSS('background-color', transparentColor);
      await expect(actions.nth(index)).not.toHaveCSS('border-style', 'none');
    }
  }

  await expect(page.locator('.main-menu__nav-action')).toHaveCount(4);
  await expectUncoveredCardActions('.main-menu__nav-action');
  for (const name of ['Champions', 'Guide et règles', 'Profil et historique', 'Réglages']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }

  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  await expect(page).toHaveURL('/starter-select');
  await expectUncoveredCardActions('.champion-card__action');

  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const started = await useRunStore.getState().startRun(['Annie', 'Ashe'], { seed: 20260801 });
    if (!started.success) throw new Error(`Unable to start high-contrast run: ${started.code}`);
  });
  await page.goto('/run');
  await page.getByRole('button', { name: 'Fermer le tutoriel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.run-team-stats__member-action')).toHaveCount(2);
  await expectUncoveredCardActions('.run-team-stats__member-action');
  await page.locator('.run-team-stats__member-action').first().focus();
  await page.keyboard.press('Tab');
  const focused = page.locator('.run-team-stats__member-action').nth(1);
  await expect(focused).toBeFocused();
  await expect(focused).toHaveCSS('outline-style', 'solid');
  expect(await focused.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
});
