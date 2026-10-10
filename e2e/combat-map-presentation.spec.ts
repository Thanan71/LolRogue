import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const offenders =
    overflow > 1
      ? await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('main *')]
            .flatMap((element) => {
              const rect = element.getBoundingClientRect();
              return rect.right > innerWidth + 1
                ? [{ className: element.className, right: rect.right, width: rect.width }]
                : [];
            })
            .slice(0, 20),
        )
      : [];
  expect(overflow, JSON.stringify(offenders)).toBeLessThanOrEqual(1);
}

async function enterGuestWithTutorialsDismissed(page: Page) {
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

async function servePackagedAssets(page: Page) {
  await page.route('**/assets/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const assetPath = path.resolve(process.cwd(), 'public', pathname.slice(1));
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: await readFile(assetPath),
    });
  });
}

async function installPresentationRunFixture(
  page: Page,
  playerChampionId = 'Lux',
  enemyChampionId = 'Malphite',
) {
  await page.evaluate(
    async ({ championId, opponentId }) => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      // Start with a legal guest roster before installing the presentation-only team.
      const companionId = 'Ashe';
      const started = await useRunStore
        .getState()
        .startRun(['Annie', companionId], { seed: 20260813 });
      if (!started.success) throw new Error(`Unable to start fixture run: ${started.code}`);
      const team = useRunStore.getState().team;

      const encounter = {
        id: 'presentation-combat',
        type: 'combat',
        name: 'Duel de présentation',
        description: 'Un duel mobile déterministe.',
        minRunLevel: 1,
        enemies: [{ championId: opponentId, level: 1, statMultiplier: 0.2 }],
        goldReward: 10,
        itemDropChance: 0,
      };
      const nodes = [
        {
          id: 'presentation-start',
          type: 'start',
          column: 0,
          row: 0,
          nextNodeIds: ['presentation-checkpoint'],
          prevNodeIds: [],
          biome: 'top_lane',
          completed: true,
          accessible: false,
          encounter: null,
          metadata: { title: 'Départ', description: 'Chemin parcouru.', icon: '▶' },
        },
        {
          id: 'presentation-checkpoint',
          type: 'rest',
          column: 1,
          row: 0,
          nextNodeIds: ['presentation-combat', 'presentation-locked'],
          prevNodeIds: ['presentation-start'],
          biome: 'top_lane',
          completed: true,
          accessible: false,
          encounter: null,
          metadata: { title: 'Campement', description: 'Position actuelle.', icon: '✚' },
        },
        {
          id: 'presentation-combat',
          type: 'combat',
          column: 2,
          row: 0,
          nextNodeIds: [],
          prevNodeIds: ['presentation-checkpoint'],
          biome: 'top_lane',
          completed: false,
          accessible: true,
          encounter,
          metadata: { title: 'Duel', description: 'Combat disponible.', icon: '⚔' },
        },
        {
          id: 'presentation-locked',
          type: 'shop',
          column: 2,
          row: 1,
          nextNodeIds: [],
          prevNodeIds: ['presentation-checkpoint'],
          biome: 'top_lane',
          completed: false,
          accessible: false,
          encounter: null,
          metadata: { title: 'Boutique', description: 'Branche verrouillée.', icon: '◆' },
        },
      ];

      useRunStore.setState({
        team: team.map((member) =>
          member.championId === companionId
            ? { ...member, currentHp: 0 }
            : { ...member, championId },
        ),
        biomeMaps: [
          {
            biome: 'top_lane',
            startNodeId: 'presentation-start',
            exitNodeId: 'presentation-combat',
            columns: 3,
            rows: 2,
            nodes,
          },
        ],
        currentBiomeIndex: 0,
        currentBiome: 'top_lane',
        currentNodeId: 'presentation-checkpoint',
        chosenPathNodeIds: ['presentation-start', 'presentation-checkpoint'],
        completedNodeIds: ['presentation-start', 'presentation-checkpoint'],
        frontierNodeIds: ['presentation-combat'],
        pendingEncounter: null,
        currentEncounter: null,
      } as never);
    },
    { championId: playerChampionId, opponentId: enemyChampionId },
  );
}

test('la carte et le combat restent lisibles et animés sur mobile', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize(MOBILE_VIEWPORT);
  // Vite deliberately disables publicDir; the production build copies this
  // integrity-checked package. Serve the same checked-in files to this dev E2E.
  await servePackagedAssets(page);
  await enterGuestWithTutorialsDismissed(page);
  await installPresentationRunFixture(page);
  await page.goto('/run');

  await expect(page.getByRole('heading', { name: 'Carte de la partie' })).toBeVisible();
  await expect(page.locator('.run-map-edge--traversed .run-map-edge__line')).toHaveCount(1);
  await expect(page.locator('.run-map-edge--available .run-map-edge__line')).toHaveCount(1);
  await expect(page.locator('.run-map-edge--future .run-map-edge__line')).toHaveCount(1);
  await expect(page.locator('.run-map-node--completed')).toHaveCount(2);
  await expect(page.locator('.run-map-node--accessible')).toHaveCount(1);
  await expect(page.locator('.run-map-node--locked')).toHaveCount(1);

  const combatNode = page.getByRole('button', { name: /Combat, colonne 3.*accessible/i });
  await expect(combatNode).toBeVisible();
  await expect(combatNode.locator('.run-map-node__hit-area')).toHaveAttribute('r', '31');
  await expect(page.getByRole('img', { name: /Boutique, colonne 3.*verrouillé/i })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('run-map-mobile-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await combatNode.dispatchEvent('click');
  await expect(page).toHaveURL('/combat');
  await expect(page.getByText(/Combat — Tour/)).toBeVisible();

  const abilityIcons = page.locator('.combat-ability__image');
  await expect(abilityIcons).toHaveCount(4);
  await expect(abilityIcons.first()).toBeVisible();
  await expect
    .poll(
      () =>
        abilityIcons.evaluateAll((images) =>
          images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
        ),
      { message: 'Les quatre icônes Data Dragon doivent être décodées.' },
    )
    .toBe(true);
  const iconStates = await abilityIcons.evaluateAll((images) =>
    images.map((image) => {
      const element = image as HTMLImageElement;
      return {
        complete: element.complete,
        naturalWidth: element.naturalWidth,
        objectFit: getComputedStyle(element).objectFit,
        source: new URL(element.currentSrc || element.src).pathname,
      };
    }),
  );
  expect(iconStates).toHaveLength(4);
  for (const icon of iconStates) {
    expect(icon.complete).toBe(true);
    expect(icon.naturalWidth).toBeGreaterThan(0);
    expect(icon.objectFit).toBe('contain');
    expect(icon.source).toMatch(/^\/assets\/riot\/16\.6\.1\/spells\/.+\.png$/);
  }

  const beforeCommand = await page.evaluate(async () => {
    const { useBattleStore } = await import('/src/stores/battleStore.ts');
    const { enemyTeam, log } = useBattleStore.getState();
    return {
      hp: enemyTeam.map((member) => member.currentHp),
      actions: log.filter((entry) => entry.type === 'action').length,
    };
  });
  await page.getByRole('button', { name: /Sort Q : Entrave de lumière/ }).click();
  await page.getByRole('button', { name: 'Cibler Malphite' }).click();
  expect(
    await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts');
      const { enemyTeam, log } = useBattleStore.getState();
      return {
        hp: enemyTeam.map((member) => member.currentHp),
        actions: log.filter((entry) => entry.type === 'action').length,
      };
    }),
  ).toEqual(beforeCommand);
  await page.getByRole('button', { name: /^Confirmer :/ }).click();

  const effect = page.locator('.combat-stage[data-combat-effect]');
  const effectSnapshot = await effect.evaluate((element) => ({
    source: element.getAttribute('data-combat-source'),
    target: element.getAttribute('data-combat-target'),
    attacker: element.querySelector('[aria-label^="Attaquant :"]')?.getAttribute('aria-label'),
    victim: element.querySelector('[aria-label^="Cible :"]')?.getAttribute('aria-label'),
    action: element.querySelector('.combat-stage__action')?.textContent,
  }));
  expect(effectSnapshot).toMatchObject({
    source: 'Lux',
    target: 'Malphite',
    attacker: 'Attaquant : Lux',
    victim: expect.stringMatching(/^Cible : Malphite/),
  });
  await expect(effect.getByRole('list', { name: 'États de Malphite' })).toContainText(
    'Immobilisé · 2 tours',
  );
  expect(effectSnapshot.action).toContain('Entrave de lumière');
  expect(effectSnapshot.action).toContain('Lux → Malphite');
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('combat-effect-mobile-390', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('une compétence offensive garde l’ennemi comme cible malgré son bonus personnel', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await servePackagedAssets(page);
  await enterGuestWithTutorialsDismissed(page);
  await installPresentationRunFixture(page, 'Garen');
  await page.goto('/run');

  await page.getByRole('button', { name: /Combat, colonne 3.*accessible/i }).dispatchEvent('click');
  await expect(page).toHaveURL('/combat');
  await page.getByRole('button', { name: /Sort Q : Coup décisif/ }).click();
  await page.getByRole('button', { name: 'Cibler Malphite' }).click();
  await page.getByRole('button', { name: /^Confirmer :/ }).click();

  const effect = page.locator('.combat-stage[data-combat-effect]');
  await expect(effect).toHaveAttribute('data-combat-source', 'Garen');
  await expect(effect).toHaveAttribute('data-combat-target', 'Malphite');
  await expect(effect.getByLabel('Attaquant : Garen')).toBeVisible();
  await expect(effect.getByLabel('Cible : Malphite')).toBeVisible();
  await expect(effect.getByText('Votre équipe')).toBeVisible();
  await expect(effect.getByText('Équipe ennemie')).toBeVisible();
  await expect(effect).not.toHaveClass(/combat-stage--friendly/);
  await expect(effect.getByLabel('Effet personnel : Garen')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('une action ennemie garde attaquant et cible sur la même ligne du duel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await servePackagedAssets(page);
  await enterGuestWithTutorialsDismissed(page);
  await installPresentationRunFixture(page, 'Lux', 'Garen');
  await page.goto('/run');

  await page.getByRole('button', { name: /Combat, colonne 3.*accessible/i }).dispatchEvent('click');
  await expect(page).toHaveURL('/combat');
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { useBattleStore } = await import('/src/stores/battleStore.ts');
          const state = useBattleStore.getState();
          return (
            state.enemyTeam.some((member) => !member.isDefeated) &&
            state.playerTeam.some((member) => !member.isDefeated)
          );
        }),
      { message: 'Le combat doit hydrater les deux équipes avant le test de présentation.' },
    )
    .toBe(true);

  await page.evaluate(async () => {
    const [{ useBattleStore }, { ActionType }] = await Promise.all([
      import('/src/stores/battleStore.ts'),
      import('/src/game/battle/types.ts'),
    ]);
    const state = useBattleStore.getState();
    const source = state.enemyTeam.find((member) => !member.isDefeated);
    const target = state.playerTeam.find((member) => !member.isDefeated);
    if (!source || !target) throw new Error('Enemy-action presentation fixture is incomplete.');

    useBattleStore.getState().showVisualEvent({
      kind: 'damage',
      action: ActionType.BasicAttack,
      sourceId: source.id,
      sourceCombatantId: source.targetId,
      sourceSide: 'enemy',
      targetId: target.id,
      targetCombatantId: target.targetId,
      targetSide: 'player',
      amount: 44,
    });
  });

  const effect = page.locator('.combat-stage[data-combat-effect]');
  await expect(effect).toHaveClass(/combat-stage--from-enemy/);
  const geometry = await effect.evaluate((element) => {
    const source = element.querySelector<HTMLElement>('.combat-stage__fighter--source');
    const target = element.querySelector<HTMLElement>('.combat-stage__fighter--target');
    if (!source || !target) throw new Error('Duel fighters are missing.');

    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return {
      sourceGridRow: getComputedStyle(source).gridRowStart,
      targetGridRow: getComputedStyle(target).gridRowStart,
      sourceCenterY: sourceRect.top + sourceRect.height / 2,
      targetCenterY: targetRect.top + targetRect.height / 2,
    };
  });

  expect(geometry.sourceGridRow).toBe('1');
  expect(geometry.targetGridRow).toBe('1');
  expect(Math.abs(geometry.sourceCenterY - geometry.targetCenterY)).toBeLessThanOrEqual(1);
});

test('deux champions identiques restent séparés par leur camp dans toute la présentation', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await servePackagedAssets(page);
  await enterGuestWithTutorialsDismissed(page);
  await installPresentationRunFixture(page, 'Garen', 'Garen');
  await page.goto('/run');

  await page.getByRole('button', { name: /Combat, colonne 3.*accessible/i }).dispatchEvent('click');
  await expect(page).toHaveURL('/combat');

  await expect(page.locator('.combatant-portrait--active')).toHaveCount(1);
  await expect(page.locator('.combatant-portrait--active.combatant-portrait--player')).toHaveCount(
    1,
  );
  const enemyTarget = page.getByRole('button', { name: 'Cibler Garen' });
  await expect(enemyTarget).toHaveCount(1);

  await page.getByRole('button', { name: /Sort Q : Coup décisif/ }).click();
  await enemyTarget.click();
  await page.getByRole('button', { name: /^Confirmer :/ }).click();

  const effect = page.locator('.combat-stage[data-combat-effect]');
  await expect(
    effect.locator('.combat-stage__fighter--source.combat-stage__fighter--player'),
  ).toBeVisible();
  await expect(
    effect.locator('.combat-stage__fighter--target.combat-stage__fighter--enemy'),
  ).toBeVisible();
  await expect(effect.getByText('Votre équipe')).toBeVisible();
  await expect(effect.getByText('Équipe ennemie')).toBeVisible();
  await expect(effect).not.toHaveClass(/combat-stage--friendly/);
  await expect(effect).not.toHaveClass(/combat-stage--self/);
  await expectNoHorizontalOverflow(page);
});

for (const width of [320, 390]) {
  test(`les états et les sorts indisponibles restent consultables avec grand texte à ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await servePackagedAssets(page);
    await enterGuestWithTutorialsDismissed(page);
    await installPresentationRunFixture(page);
    await page.goto('/run');
    await page
      .getByRole('button', { name: /Combat, colonne 3.*accessible/i })
      .dispatchEvent('click');
    await expect(page.getByRole('button', { name: /Sort Q : Entrave de lumière/ })).toBeVisible();
    // Render multiple concurrent effects deterministically; engine snapshots and
    // duration expiry are covered separately by combatStatuses unit tests.
    await page.evaluate(async () => {
      const [{ useBattleStore }, { useSettingsStore }, { CCType }] = await Promise.all([
        import('/src/stores/battleStore.ts'),
        import('/src/stores/settingsStore.ts'),
        import('/src/game/effects/types.ts'),
      ]);
      useSettingsStore.getState().setTextSize('large');
      const state = useBattleStore.getState();
      useBattleStore.setState({
        playerTeam: state.playerTeam.map((member) =>
          member.id === 'Lux'
            ? {
                ...member,
                statuses: [{ id: 'fixture-silence', kind: CCType.Silence, turnsRemaining: 1 }],
                spells: member.spells.map((spell) => ({
                  ...spell,
                  isReady: false,
                  cooldownCurrent: 2,
                })),
              }
            : member,
        ),
        enemyTeam: state.enemyTeam.map((member) => ({
          ...member,
          statuses: [
            { id: 'fixture-stun', kind: CCType.Stun, turnsRemaining: 2 },
            { id: 'fixture-shield', kind: 'shield', turnsRemaining: 1, amount: 120 },
          ],
        })),
      });
    });
    const enemy = page.locator('.combatant-portrait--enemy');
    await expect(enemy.getByRole('list', { name: 'États de Malphite' })).toContainText(
      'Étourdi · 2 tours',
    );
    await expect(enemy.getByRole('list', { name: 'États de Malphite' })).toContainText(
      'Bouclier 120 · 1 tour',
    );
    await expect(
      page.locator('.combatant-portrait--player').getByRole('list', { name: 'États de Lux' }),
    ).toContainText('Silence · 1 tour');
    const spell = page.getByRole('button', { name: /Sort Q : Entrave de lumière/ });
    await expect(spell).toHaveAttribute('aria-disabled', 'true');
    await spell.focus();
    await expect(spell).toBeFocused();
    const inspect = page.getByRole('button', { name: 'Détails du sort Entrave de lumière' });
    await inspect.focus();
    await page.keyboard.press('Enter');
    const details = page.getByRole('dialog', { name: 'Détails du sort Entrave de lumière' });
    await expect(details).toBeVisible();
    const box = await details.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(7);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 7);
    expect(box!.y).toBeGreaterThanOrEqual(7);
    expect(box!.y + box!.height).toBeLessThanOrEqual(837);
    await page.getByRole('button', { name: /Sort W : Barrière prismatique/ }).hover();
    await expect(details).toBeVisible();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await testInfo.attach(`combat-states-large-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await details.getByRole('button', { name: 'Fermer les détails du sort' }).click();
    await expect(inspect).toBeFocused();
    await expectNoHorizontalOverflow(page);
  });
}
