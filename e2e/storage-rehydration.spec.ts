import { expect, type Page, test } from '@playwright/test';
import { STORAGE_POLICIES } from '../src/utils/storagePolicy';

async function observeOfflinePage(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === '127.0.0.1' || host === 'localhost') await route.continue();
    else await route.abort('blockedbyclient');
  });
  return errors;
}

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('region', { name: 'Boucle de jeu' })).toBeVisible();
}

for (const corruption of ['truncated', 'future', 'mistyped', 'oversized'] as const) {
  test(`corrupt ${corruption} caches cannot crash startup or restore verified authority`, async ({
    page,
  }) => {
    const errors = await observeOfflinePage(page);
    await page.addInitScript(
      ({ policies, variant }) => {
        for (const [key, policy] of Object.entries(policies)) {
          const raw =
            variant === 'truncated'
              ? '{"state":'
              : variant === 'oversized'
                ? 'x'.repeat(policy.maxChars + 1)
                : JSON.stringify({
                    version: variant === 'future' ? 999 : '7',
                    state: {
                      isActive: true,
                      startRun: 42,
                      team: 'broken',
                      serverProgression: { verified: true },
                      authorityAttempt: { status: 'verified' },
                      language: ['en-US'],
                    },
                  });
          localStorage.setItem(key, raw);
        }
      },
      { policies: STORAGE_POLICIES, variant: corruption },
    );
    await enterGuest(page);
    const state = await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      const run = useRunStore.getState();
      return {
        active: run.isActive,
        authority: run.authorityAttempt,
        progression: run.serverProgression,
        start: typeof run.startRun,
      };
    });
    expect(state).toEqual({ active: false, authority: null, progression: null, start: 'function' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(errors).toEqual([]);
  });
}

for (const blocked of ['getter', 'getItem', 'setItem', 'removeItem'] as const) {
  test(`storage ${blocked} failures leave guest navigation usable`, async ({ page }) => {
    const errors = await observeOfflinePage(page);
    await page.addInitScript((operation) => {
      if (operation === 'getter') {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('blocked', 'SecurityError');
          },
        });
      } else {
        if (operation === 'removeItem') localStorage.setItem('lolrogue-guest-mode', '{broken');
        Storage.prototype[operation] = () => {
          throw new DOMException(
            'blocked',
            operation === 'setItem' ? 'QuotaExceededError' : 'SecurityError',
          );
        };
      }
    }, blocked);
    await enterGuest(page);
    await page.getByRole('button', { name: 'Comprendre les règles' }).click();
    await expect(page.getByRole('heading', { name: 'Guide et règles' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a valid guest run and legacy tutorial completion survive real browser reloads', async ({
  page,
}) => {
  const errors = await observeOfflinePage(page);
  await enterGuest(page);
  await page.evaluate(async () => {
    localStorage.setItem('lolrogue:tutorial:map:v1', 'done');
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const result = await useRunStore.getState().startRun(['Garen', 'Lux'], { seed: 20260928 });
    if (!result.success) throw new Error(result.code);
  });
  await page.goto('/run');
  const tutorial = page.getByRole('dialog', { name: 'Comprendre la carte' });
  await expect(page.getByRole('button', { name: 'Tutoriel carte' })).toBeVisible();
  await expect(tutorial).toBeHidden();
  const migrated = await page.evaluate(() => ({
    old: localStorage.getItem('lolrogue:tutorial:map:v1'),
    current: JSON.parse(localStorage.getItem('lolrogue:tutorial:map:v2') ?? 'null'),
  }));
  expect(migrated.old).toBeNull();
  expect(migrated.current).toMatchObject({ version: 2, state: { completed: true } });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tutoriel carte' })).toBeVisible();
  await expect(tutorial).toBeHidden();
  expect(
    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      const run = useRunStore.getState();
      return {
        active: run.isActive,
        seed: run.seed,
        members: run.team.length,
        authority: run.authorityAttempt,
      };
    }),
  ).toEqual({ active: true, seed: 20260928, members: 2, authority: null });
  await page.getByRole('button', { name: 'Tutoriel carte' }).click();
  await expect(tutorial).toBeVisible();
  expect(errors).toEqual([]);
});
