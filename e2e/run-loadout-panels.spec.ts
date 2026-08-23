import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function servePackagedAssets(page: Page) {
  await page.route('**/assets/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const assetPath = path.resolve(process.cwd(), 'public', pathname.slice(1));
    await route.fulfill({
      status: 200,
      contentType: pathname.endsWith('.webp') ? 'image/webp' : 'image/png',
      body: await readFile(assetPath),
    });
  });
}

async function enterGuest(page: Page) {
  await page.goto('/auth');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
  await page.evaluate(() => {
    localStorage.setItem('lolrogue:tutorial:map:v1', 'done');
  });
}

async function installLoadoutFixture(page: Page) {
  await page.evaluate(async () => {
    const [{ getCanonicalRunItem }, { useRunStore }] = await Promise.all([
      import('/src/game/inventory/inventoryRules.ts'),
      import('/src/stores/runStore.ts'),
    ]);
    const started = await useRunStore.getState().startRun(['Garen', 'Lux'], { seed: 20260814 });
    if (!started.success) throw new Error(`Unable to start fixture run: ${started.code}`);
    const sword = getCanonicalRunItem('long_sword');
    const armor = getCanonicalRunItem('cloth_armor');
    const tome = getCanonicalRunItem('amplifying_tome');
    if (!sword || !armor || !tome) throw new Error('Fixture item missing.');

    useRunStore.setState({
      team: [
        {
          championId: 'Garen',
          level: 5,
          currentHp: 610,
          currentXp: 42,
          spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
        },
        {
          championId: 'Lux',
          level: 4,
          currentHp: 430,
          currentXp: 18,
          spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
        },
      ],
      inventory: [
        { instanceId: 'fixture-sword', item: sword, equippedToChampionId: null },
        { instanceId: 'fixture-armor', item: armor, equippedToChampionId: 'Garen' },
        { instanceId: 'fixture-tome', item: tome, equippedToChampionId: null },
      ],
      nextItemInstanceId: 4,
      pendingSpellUpgradeChampionIds: ['Garen'],
    });
  });
}

for (const viewport of VIEWPORTS) {
  test(`équipement, statistiques et sorts restent pratiques en ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await servePackagedAssets(page);
    await enterGuest(page);
    await installLoadoutFixture(page);
    await page.getByRole('button', { name: 'Continuer la partie' }).click();
    await expect(page).toHaveURL('/run');

    const upgrade = page.getByRole('region', { name: 'Amélioration de sort' });
    await expect(upgrade).toBeVisible();
    await expect(upgrade.locator('.spell-upgrade__spell')).toHaveCount(4);
    await expect(upgrade.locator('img[src*="/spells/"]')).toHaveCount(4);
    const currentImpact = upgrade.getByRole('region', { name: /Rang actuel · 1/ });
    const nextImpact = upgrade.getByRole('region', { name: /Prochain rang · 2/ });
    await expect(currentImpact.getByText('Dégâts physiques')).toBeVisible();
    await expect(nextImpact.getByText('Dégâts physiques')).toBeVisible();
    const currentDamage = Number.parseInt(
      (await currentImpact.getByText(/^\d+ · avant défenses$/).textContent()) ?? '',
      10,
    );
    const nextDamage = Number.parseInt(
      (await nextImpact.getByText(/^\d+ · avant défenses$/).textContent()) ?? '',
      10,
    );
    expect(currentDamage).toBeGreaterThan(0);
    expect(nextDamage).toBeGreaterThan(currentDamage);

    const ultimate = upgrade.getByRole('button', { name: /Justice de Demacia/ });
    if (viewport.width <= 390) await ultimate.click();
    else await ultimate.hover();
    await expect(upgrade.getByText('Dégâts bruts')).toBeVisible();
    await expect(upgrade.getByText(/150 · avant défenses/)).toBeVisible();

    const teamPanel = page.getByRole('region', { name: 'Équipe' });
    await expect(teamPanel).toBeVisible();
    await teamPanel.getByRole('button', { name: /Lux/ }).click();
    await expect(teamPanel.getByRole('heading', { name: 'Lux' })).toBeVisible();
    for (const stat of [
      'PV actuels / maximum',
      'Attaque',
      'Puissance',
      'Armure',
      'Résistance magique',
      "Vitesse d'attaque",
      'Critique',
    ]) {
      await expect(teamPanel.locator('dt').filter({ hasText: stat }).first()).toBeVisible();
    }

    const inventoryPanel = page.getByRole('region', { name: 'Inventaire' });
    await expect(inventoryPanel).toBeVisible();
    const itemImages = inventoryPanel.locator('.run-inventory-image--item img');
    await expect(itemImages).toHaveCount(3);
    await expect
      .poll(() =>
        itemImages.evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
      )
      .toBe(true);

    await inventoryPanel.getByRole('button', { name: /Épée longue.*Dans le sac/i }).click();
    await inventoryPanel.getByRole('button', { name: /Lux.*0\/6 objets/i }).click();
    await expect(inventoryPanel.getByText('Aperçu sur Lux')).toBeVisible();
    await expect(inventoryPanel.getByText("Dégâts d'attaque").first()).toBeVisible();
    await inventoryPanel.getByRole('button', { name: 'Équiper sur Lux' }).click();
    await expect(inventoryPanel.getByRole('status')).toContainText('Épée longue');
    await expect(inventoryPanel.getByText('Équipé · Lux')).toBeVisible();

    await expectNoHorizontalOverflow(page);
    await testInfo.attach(`run-loadout-${viewport.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  });
}
