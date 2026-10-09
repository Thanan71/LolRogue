import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

async function expectNoWcagAccessibilityViolations(page: Page, route: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = result.violations;
  expect(violations, `${route}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
  await page.evaluate(() => {
    localStorage.setItem('lolrogue:tutorial:map:v1', 'done');
    localStorage.setItem('lolrogue:tutorial:combat:v1', 'done');
  });
}

test('les routes principales respectent les règles axe critiques', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'LoL Rogue' })).toBeVisible();
  await expect(page).toHaveTitle('Connexion — LoL Rogue');
  await expect(page.locator('main, h1').first()).toBeFocused();
  await expectNoWcagAccessibilityViolations(page, '/auth');

  await enterGuest(page);
  await expectNoWcagAccessibilityViolations(page, '/');

  for (const [button, path, heading] of [
    ['Champions', '/database', 'Base des champions'],
    ['Guide et règles', '/rules', 'Guide et règles'],
    ['Réglages', '/settings', 'Réglages'],
    ['Crédits', '/credits', 'Crédits'],
    ['Défi quotidien', '/daily-run', 'Défi quotidien'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${heading} — LoL Rogue`);
    await expect(page.locator('main, h1').first()).toBeFocused();
    await expectNoWcagAccessibilityViolations(page, path);
    await page
      .getByRole('button', { name: /Retour(?: au menu)?/ })
      .or(page.getByRole('link', { name: /Retour(?: au menu)?/ }))
      .first()
      .click();
  }

  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  await expect(page).toHaveURL('/starter-select');
  await expectNoWcagAccessibilityViolations(page, '/starter-select');

  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const started = await useRunStore.getState().startRun(['Annie', 'Ashe'], { seed: 20260801 });
    if (!started.success) throw new Error(`Unable to start accessibility run: ${started.code}`);
  });
  await page.goto('/run');
  await expect(page.getByRole('button', { name: /tutoriel carte/i })).toBeVisible();
  await expectNoWcagAccessibilityViolations(page, '/run');

  const startNode = page.getByRole('button', { name: /départ du biome.*accessible/i }).first();
  await startNode.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/combat');

  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const { NodeType } = await import('/src/game/map/types.ts');
    const encounter = {
      id: 'a11y-combat',
      type: 'combat' as const,
      name: "Combat d'accessibilité",
      description: 'Combat de test',
      minRunLevel: 1,
      enemies: [{ championId: 'Warwick', level: 1, statMultiplier: 1 }],
      goldReward: 0,
      itemDropChance: 0,
    };
    const node = {
      id: 'a11y-node',
      type: NodeType.Combat,
      column: 0,
      row: 0,
      nextNodeIds: [],
      prevNodeIds: [],
      biome: 'top_lane' as const,
      completed: false,
      accessible: true,
      encounter,
      metadata: { title: "Combat d'accessibilité", description: 'Combat de test', icon: '⚔' },
    };
    useRunStore.setState({
      biomeMaps: [
        {
          biome: 'top_lane',
          startNodeId: node.id,
          exitNodeId: node.id,
          columns: 1,
          rows: 1,
          nodes: [node],
        },
      ],
      currentBiomeIndex: 0,
      currentBiome: 'top_lane',
      currentNodeId: node.id,
      chosenPathNodeIds: [node.id],
      frontierNodeIds: [node.id],
      completedNodeIds: [],
      pendingEncounter: { nodeId: node.id, nodeType: 'combat' },
      currentEncounter: encounter,
    });
  });
  await page.goto('/combat');
  await expect(page.getByText(/Combat — Tour/)).toBeVisible();
  await expectNoWcagAccessibilityViolations(page, '/combat');

  await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const state = useRunStore.getState();
    if (!state.isActive) throw new Error('The accessibility combat must still be active.');
    const completed = await state.endRun(false, state.runId);
    if (!completed.success) {
      throw new Error(`Unable to finish accessibility run: ${completed.code}`);
    }
  });
  await page.goto('/game-over');
  await expect(page.getByRole('heading', { name: 'Défaite' })).toBeVisible();
  await expectNoWcagAccessibilityViolations(page, '/game-over');
});

test('Auth et Database sont utilisables avec les flèches et le clavier', async ({ page }) => {
  await page.goto('/auth');
  const loginTab = page.getByRole('tab', { name: 'Connexion' });
  await loginTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Créer un compte' })).toBeFocused();
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'auth-tab-signup');

  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: 'Champions' }).click();
  const champion = page.getByRole('button', { name: /Annie/ }).first();
  await champion.focus();
  await page.keyboard.press('Enter');
  await expect(champion).toHaveAttribute('aria-pressed', 'true');
  const infoTab = page.getByRole('tab', { name: /Informations/ });
  await expect(infoTab).toHaveAttribute('aria-selected', 'true');
  await infoTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Améliorations/ })).toBeFocused();
});
