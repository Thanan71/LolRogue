import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const budgets = JSON.parse(
  await readFile(new URL('../config/performance-budgets.json', import.meta.url), 'utf8'),
).mobileWebVitals;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const metrics = { cls: 0, lcp: 0, interactions: [] as number[] };
    Object.assign(window, { __lolRogueVitals: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) {
          metrics.cls += shift.value ?? 0;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      metrics.lcp = list.getEntries().at(-1)?.startTime ?? metrics.lcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    if (PerformanceObserver.supportedEntryTypes.includes('event')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.interactions.push(entry.duration);
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    }
  });
});

test('le build de production reste utilisable', async ({
  page,
  context,
  browserName,
}, testInfo) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'LoL Rogue' })).toBeVisible();
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page.getByText('Mode invité')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');

  if (browserName === 'chromium') {
    await context.setOffline(true);
    // Offline contract: an already loaded guest session remains readable and
    // interactive; routes not loaded yet are not promised without a service worker.
    await expect(page.getByText('Mode invité')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réglages' })).toBeEnabled();
    await context.setOffline(false);
  }

  if (testInfo.project.name === 'mobile-chromium-production') {
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => {
      const value = (
        window as Window & {
          __lolRogueVitals: { cls: number; lcp: number; interactions: number[] };
        }
      ).__lolRogueVitals;
      return { ...value, inp: Math.max(0, ...value.interactions) };
    });
    expect(metrics.lcp).toBeLessThanOrEqual(budgets.lcpMs);
    expect(metrics.cls).toBeLessThanOrEqual(budgets.cls);
    expect(metrics.inp).toBeLessThanOrEqual(budgets.inpMs);
  }
});
