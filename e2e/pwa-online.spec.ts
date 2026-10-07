import { expect, test } from '@playwright/test';

test('exposes a valid install manifest and app icons without an offline worker', async ({
  page,
}) => {
  await page.goto('/auth');
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  const response = await page.request.get('/manifest.webmanifest');
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    name: 'LoL Rogue',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    prefer_related_applications: false,
  });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
    '192x192',
    '512x512',
    '512x512',
  ]);
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
    const data = await image.body();
    const size = Number(icon.sizes.split('x')[0]);
    expect(data.readUInt32BE(16)).toBe(size);
    expect(data.readUInt32BE(20)).toBe(size);
  }
  expect(
    await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)),
  ).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
});

test('requires the network for a fresh PWA launch', async ({ browser }) => {
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage();
    await expect(page.goto('http://127.0.0.1:4173/')).rejects.toThrow();
  } finally {
    await context.close();
  }
});

test('manifest changes leave the current guest run active', async ({ page }) => {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  for (let index = 0; index < 2; index++) {
    await page.locator('button.champion-card[aria-pressed="false"]:not(:disabled)').first().click();
  }
  await page.getByRole('button', { name: 'Confirmer le choix' }).click();
  await expect(page).toHaveURL('/run');
  const runId = await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    return useRunStore.getState().runId;
  });
  await page.route('**/manifest.webmanifest', async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    await route.fulfill({ json: { ...manifest, short_name: 'LoL Rogue v2' } });
  });
  await page.evaluate(async () => {
    await fetch('/manifest.webmanifest', { cache: 'reload' });
  });
  expect(
    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      return { active: useRunStore.getState().isActive, runId: useRunStore.getState().runId };
    }),
  ).toEqual({ active: true, runId });
  await expect(page).toHaveURL('/run');
});
