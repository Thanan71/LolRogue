import { expect, type Locator, type Page, test } from '@playwright/test';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x720', width: 1280, height: 720 },
] as const;

// At 200% browser zoom, a 1280x720 window exposes a 640x360 CSS viewport.
const ZOOM_200_VIEWPORT = { name: '1280x720 at 200% zoom', width: 640, height: 360 } as const;

async function expectReachableAction(locator: Locator, options?: { canBeDisabled?: boolean }) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
  await expect(locator).toBeVisible();

  const metrics = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );

    return {
      height: rect.height,
      insideViewport:
        rect.top >= -0.5 &&
        rect.left >= -0.5 &&
        rect.bottom <= window.innerHeight + 0.5 &&
        rect.right <= window.innerWidth + 0.5,
      receivesPointer: hitTarget === element || element.contains(hitTarget),
      disabled: element instanceof HTMLButtonElement && element.disabled,
    };
  });

  expect(metrics.height).toBeGreaterThanOrEqual(44);
  expect(metrics.insideViewport).toBe(true);
  expect(metrics.receivesPointer).toBe(true);

  if (!metrics.disabled) {
    await locator.focus();
    await expect(locator).toBeFocused();
  } else {
    expect(options?.canBeDisabled).toBe(true);
  }
}

async function expectDocumentShell(page: Page, shellSelector: string, footerSelector: string) {
  const shell = page.locator(shellSelector);
  const footer = page.locator(footerSelector);

  await expect(shell).toBeVisible();
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();

  const layout = await page.evaluate(
    ({ shellSelector: currentShell, footerSelector: currentFooter }) => {
      const shellElement = document.querySelector<HTMLElement>(currentShell);
      const footerElement = document.querySelector<HTMLElement>(currentFooter);
      if (!shellElement || !footerElement) throw new Error('Responsive shell is incomplete.');

      const shellStyle = getComputedStyle(shellElement);
      const footerStyle = getComputedStyle(footerElement);
      const footerRect = footerElement.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        footerRect.left + footerRect.width / 2,
        footerRect.top + footerRect.height / 2,
      );

      return {
        shellPosition: shellStyle.position,
        shellMinHeight: Number.parseFloat(shellStyle.minHeight),
        footerPosition: footerStyle.position,
        footerReceivesPointer:
          hitTarget === footerElement || (hitTarget ? footerElement.contains(hitTarget) : false),
        horizontalOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        documentCanScroll:
          document.documentElement.scrollHeight >= document.documentElement.clientHeight,
      };
    },
    { shellSelector, footerSelector },
  );

  expect(layout.shellPosition).not.toBe('fixed');
  expect(layout.shellMinHeight).toBeGreaterThanOrEqual(page.viewportSize()?.height ?? 0);
  expect(layout.footerPosition).not.toBe('absolute');
  expect(layout.footerReceivesPointer).toBe(true);
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
  expect(layout.documentCanScroll).toBe(true);
}

async function exerciseAuthAndMenu(page: Page) {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'LoL Rogue' })).toBeVisible();

  const loginTab = page.locator('.auth-page__tab').filter({ hasText: /^Connexion$/ });
  const signupTab = page.getByRole('tab', { name: 'Créer un compte', exact: true });
  const guestButton = page.getByRole('button', { name: 'Jouer en invité' });

  await expectReachableAction(loginTab);
  await expectReachableAction(signupTab);
  await signupTab.click();

  await expect(page.getByLabel("Nom d'utilisateur *")).toBeVisible();
  await expectReachableAction(
    page.locator('form').getByRole('button', { name: 'Créer un compte' }),
    {
      canBeDisabled: true,
    },
  );
  await expectReachableAction(guestButton);
  await expectDocumentShell(page, '.auth-page', '.auth-page__footer');

  await loginTab.click();
  await expect(page.getByLabel('Adresse e-mail *')).toBeVisible();
  await expectReachableAction(page.locator('.auth-page__submit'), { canBeDisabled: true });
  await expectReachableAction(guestButton);

  await guestButton.click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Mode invité')).toBeVisible();

  for (const actionName of [
    'Jouer',
    'Défi quotidien',
    'Champions',
    'Profil et historique',
    'Réglages',
    'Crédits',
    'Connexion / Créer un compte',
  ]) {
    await expectReachableAction(page.getByRole('button', { name: actionName, exact: true }));
  }
  await expectDocumentShell(page, '.main-menu', '.main-menu__footer');

  await page.getByRole('button', { name: 'Connexion / Créer un compte' }).click();
  await expect(page).toHaveURL('/auth');
  await expect(page.getByRole('button', { name: 'Jouer en invité' })).toBeVisible();
}

for (const viewport of [...VIEWPORTS, ZOOM_200_VIEWPORT]) {
  test(`Auth and Menu stay operable at ${viewport.name}`, async ({ page, context }, testInfo) => {
    await context.addInitScript(() => localStorage.clear());
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await exerciseAuthAndMenu(page);

    const attachmentName = viewport.name.replaceAll(/[^a-zA-Z0-9]+/g, '-');
    await testInfo.attach(`auth-${attachmentName}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.getByRole('button', { name: 'Jouer en invité' }).click();
    await expect(page).toHaveURL('/');
    await testInfo.attach(`menu-${attachmentName}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}
