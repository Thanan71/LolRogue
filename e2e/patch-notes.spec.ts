import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
}

test('summary keeps initial focus, closes with Escape and returns focus without marking read', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);
  const summary = page.getByRole('region', { name: /Du nouveau depuis ta dernière visite/ });
  await expect(summary).toBeVisible();
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await summary.getByRole('button', { name: 'Plus tard' }).focus();
  await page.keyboard.press('Escape');
  await expect(summary).toHaveCount(0);
  await expect(page.locator('#patch-notes-menu-link')).toBeFocused();
  await expect(page.locator('#patch-notes-menu-link')).toContainText('Nouveau');
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeEnabled();
});

test('mobile history supports keyboard, category filtering, read feedback and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);
  await page.getByRole('link', { name: /Notes de mise à jour/ }).click();
  await expect(page).toHaveURL('/patch-notes');
  await expect(page).toHaveTitle('Notes de mise à jour — LoL Rogue');
  await expect(page.locator('main')).toBeFocused();
  const filter = page.getByRole('combobox', { name: 'Filtrer par catégorie' });
  await filter.selectOption('balance');
  await expect(page.getByRole('heading', { name: 'Équilibrage', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Correctifs', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Marquer comme lu' }).click();
  await expect(filter).toBeFocused();
  await expect(
    page.getByRole('status').filter({ hasText: 'Les nouveautés sont marquées comme lues.' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  const violations = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(violations.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('region', { name: /Du nouveau depuis ta dernière visite/ }),
  ).toHaveCount(0);
});
