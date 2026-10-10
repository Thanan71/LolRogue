import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
}

async function publicationCatalog(page: Page) {
  return page.evaluate(async () => {
    const { latestPatchNote, PATCH_NOTES } = await import('/src/data/patchNotes.ts');
    return {
      count: PATCH_NOTES.length,
      latestSequence: latestPatchNote()!.sequence,
      balanceCount: PATCH_NOTES.filter((note) =>
        note.entries.some((entry) => entry.category === 'balance'),
      ).length,
    };
  });
}

test('summary keeps initial focus, closes with Escape and returns focus without marking read', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);
  const summary = page.getByRole('region', { name: /Les nouveautés du jeu/ });
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

test('the English summary names game updates without assuming a previous visit', async ({
  page,
}) => {
  await page.goto('/auth');
  await Promise.all([page.waitForEvent('load'), page.getByLabel('Langue').selectOption('en-US')]);
  await page.getByRole('button', { name: 'Play as guest' }).click();
  const summary = page.getByRole('region', { name: /Game updates/ });
  await expect(summary).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await expect(page.locator('main')).toBeFocused();
});

test('mobile history supports keyboard, category filtering, read feedback and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);
  const catalog = await publicationCatalog(page);
  await page.getByRole('link', { name: /Notes de mise à jour/ }).click();
  await expect(page).toHaveURL('/patch-notes');
  await expect(page).toHaveTitle('Notes de mise à jour — LoL Rogue');
  await expect(page.locator('main')).toBeFocused();
  const filter = page.getByRole('combobox', { name: 'Filtrer par catégorie' });
  await filter.selectOption('balance');
  expect(catalog.balanceCount).toBeGreaterThan(0);
  const articles = page.getByRole('article');
  await expect(articles).toHaveCount(catalog.balanceCount);
  await expect(page.getByRole('heading', { name: 'Équilibrage', exact: true })).toHaveCount(
    catalog.balanceCount,
  );
  for (const article of await articles.all()) {
    await expect(article.getByRole('heading', { name: 'Équilibrage', exact: true })).toBeVisible();
  }
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
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
});

test('guest sees a publication once after explicit acknowledgement and a plain redeployment stays quiet', async ({
  page,
}) => {
  await enterGuest(page);
  const catalog = await publicationCatalog(page);
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await expect(page.locator('#patch-notes-menu-link')).toBeFocused();
  await expect(page.locator('#patch-notes-menu-link')).not.toContainText('Nouveau');
  await page.reload();
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
  await page.goto('/?deployment=another-sha');
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Notes de mise à jour', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(catalog.count);
  await expect(page.getByRole('button', { name: 'Marquer comme lu' })).toHaveCount(0);
});

test('a new explicit publication reappears and reading it clears all unread versions together', async ({
  page,
}) => {
  await enterGuest(page);
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  const newLatestSequence = await page.evaluate(async () => {
    const { latestPatchNote, PATCH_NOTES } = await import('/src/data/patchNotes.ts');
    const notes = PATCH_NOTES as Array<(typeof PATCH_NOTES)[number]>;
    const latestSequence = latestPatchNote()!.sequence;
    notes.push({
      ...notes[0],
      sequence: latestSequence + 1,
      version: `test-release-${latestSequence + 1}`,
      title: { 'fr-FR': 'Publication suivante', 'en-US': 'Next publication' },
    });
    notes.push({
      ...notes[0],
      sequence: latestSequence + 2,
      version: `test-release-${latestSequence + 2}`,
      title: { 'fr-FR': 'Autre publication', 'en-US': 'Another publication' },
    });
    return latestSequence + 2;
  });
  await page.locator('#patch-notes-menu-link').click();
  await page.getByRole('link', { name: 'Retour au menu' }).click();
  const summary = page.getByRole('region', { name: /Les nouveautés du jeu/ });
  await expect(summary).toContainText('2 publications à découvrir');
  await expect(summary).toContainText('Publication suivante');
  await expect(summary).toContainText('Autre publication');
  await summary.getByRole('button', { name: 'J’ai compris' }).click();
  await expect(summary).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lolrogue:patch-notes:v1:guest')!).lastSeenSequence,
    ),
  ).toBe(newLatestSequence);
});

test('blocked guest storage does not interrupt run start and retains reading during SPA navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('storage unavailable');
    };
  });
  await enterGuest(page);
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  await expect(page).toHaveURL('/starter-select');
  await page.evaluate(() => {
    history.pushState(null, '', '/');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
});

async function connectedFixture(
  page: Page,
  record: () => { sequence: number; version: string } | null,
  save: (sequence: number, version: string) => void,
  unavailable = false,
) {
  const id = '70000000-0000-4000-8000-000000000001';
  await page.route('**/rest/v1/player_patch_note_state*', async (route) => {
    const current = record();
    await route.fulfill({
      status: unavailable ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        unavailable
          ? { message: 'temporarily unavailable' }
          : current
            ? { last_seen_sequence: current.sequence, last_seen_version: current.version }
            : null,
      ),
    });
  });
  await page.route('**/rest/v1/rpc/mark_patch_notes_seen', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.p_user_id).toBe(id);
    if (!unavailable) save(body.p_sequence, body.p_version);
    await route.fulfill({
      status: unavailable ? 503 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        unavailable
          ? { message: 'temporarily unavailable' }
          : {
              user_id: id,
              last_seen_sequence: body.p_sequence,
              last_seen_version: body.p_version,
              updated_at: '2026-10-07T00:00:00Z',
            },
      ),
    });
  });
  await enterGuest(page);
  await page.evaluate(async (userId) => {
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    useAuthStore.setState({
      user: { id: userId, email: 'patch-notes@example.test' } as never,
      isGuest: false,
      isAuthenticated: true,
      authStatus: 'ready',
      isLoading: false,
    });
  }, id);
  return id;
}

test('account reads synchronize to a second device and stay isolated from the guest marker', async ({
  page,
  browser,
}) => {
  let server: { sequence: number; version: string } | null = null;
  const save = (sequence: number, version: string) => {
    server = { sequence, version };
  };
  await connectedFixture(page, () => server, save);
  const catalog = await publicationCatalog(page);
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toBeVisible();
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await expect.poll(() => server?.sequence).toBe(catalog.latestSequence);
  const anotherDevice = await browser.newContext();
  try {
    const secondPage = await anotherDevice.newPage();
    await connectedFixture(secondPage, () => server, save);
    await expect
      .poll(() =>
        secondPage.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem(
                'lolrogue:patch-notes:v1:user:70000000-0000-4000-8000-000000000001',
              ) ?? '{}',
            ).lastSeenSequence,
        ),
      )
      .toBe(catalog.latestSequence);
    await expect(secondPage.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
    // The guest on the same device still has its own unread marker.
    await secondPage.evaluate(async () => {
      const { useAuthStore } = await import('/src/stores/authStore.ts');
      useAuthStore.setState({ user: null, isGuest: true, authStatus: 'guest' });
    });
    await expect(secondPage.getByRole('region', { name: /Les nouveautés du jeu/ })).toBeVisible();
  } finally {
    await anotherDevice.close();
  }
});

test('server errors fall back locally while account run launch remains enabled', async ({
  page,
}) => {
  await connectedFixture(
    page,
    () => null,
    () => {},
    true,
  );
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toBeVisible();
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await page.locator('#patch-notes-menu-link').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Lecture enregistrée sur cet appareil' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Retour au menu' }).click();
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeEnabled();
});

test('menu updates stay hidden while a run is active and leave continuation available', async ({
  page,
}) => {
  await enterGuest(page);
  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    useRunStore.setState({ isActive: true });
  });
  await expect(page.getByRole('region', { name: /Les nouveautés du jeu/ })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continuer la partie' })).toBeEnabled();
});
