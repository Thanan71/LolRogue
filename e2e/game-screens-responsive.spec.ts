import { expect, type Page, test } from '@playwright/test';

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Play as Guest' }).click();
  await expect(page).toHaveURL('/');
}

for (const viewport of VIEWPORTS) {
  test(`game shells stay reachable at ${viewport.name}`, async ({ page, context }, testInfo) => {
    await context.addInitScript(() => localStorage.clear());
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterGuest(page);

    await page.goto('/database');
    await expect(page.getByRole('heading', { name: 'Champion Database' })).toBeVisible();
    await expect(page.getByPlaceholder('Search champions...')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`database-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.goto('/');
    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      const summary = {
        won: true,
        runLevel: 7,
        wavesCompleted: 24,
        biomesVisited: ['top_lane', 'jungle', 'mid_lane'],
        totalKills: 42,
        totalDamage: 12345,
        goldEarned: 900,
        goldSpent: 640,
        goldBalance: 260,
        championStats: ['Garen', 'Ashe', 'Lux', 'Leona', 'Warwick'].map((championId) => ({
          championId,
          kills: 8,
          assists: 5,
          totalDamage: 2400,
          healingDone: 120,
          shieldingDone: 80,
        })),
      };
      useRunStore.setState({
        saveStatus: 'saved',
        completedRunSnapshot: {
          runId: 'responsive-run',
          mode: 'normal',
          won: true,
          runLevel: 7,
          wavesCompleted: 24,
          biomesVisited: summary.biomesVisited,
          goldEarned: 900,
          goldSpent: 640,
          goldBalance: 260,
          summary,
          teamMembers: summary.championStats.map(({ championId }) => ({ championId })),
          startedAt: new Date().toISOString(),
          seed: 1,
          runeIds: [],
          augmentIds: [],
          ledger: {},
          daily: null,
        } as never,
      });
    });
    await page.goto('/game-over');
    await expect(page.getByRole('heading', { name: 'Victory!' })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Main Menu' });
    await menu.scrollIntoViewIfNeeded();
    await expect(menu).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`game-over-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    await page.goto('/');
    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      useRunStore.setState({ completedRunSnapshot: null, saveStatus: 'idle' });
      await useRunStore.getState().startRun(['Garen'], { seed: 20260801 });
    });
    await page.goto('/run');
    await expect(page.getByRole('button', { name: /aide/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`run-map-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}
