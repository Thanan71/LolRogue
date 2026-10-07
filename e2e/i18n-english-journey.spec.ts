import { expect, type Locator, type Page, test } from '@playwright/test';
import type { CombatEncounter, MapNode, TreasureEncounter } from '@/game/map/types';

const FRENCH_UI_MARKERS = [
  'Jouer en invité',
  'Langue',
  'Connexion',
  'Créer un compte',
  'Retour',
  'Compose ton équipe',
  'Choisis tes runes',
  'Confirmer le choix',
  'Étapes de préparation',
  'Carte de la partie',
  'Comprendre la carte',
  'Inventaire',
  'Dans le sac',
  'Trier',
  'Combat — Tour',
  'Ton premier combat',
  'Attaque de base',
  'Choisis une cible valide',
  'Vitesse',
  'Trésor',
  'Récompenses récupérées',
  'Continuer',
  'Victoire',
  'Défaite',
  'Partie enregistrée',
  'Menu principal',
] as const;

async function keepJourneyOffline(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
}

async function navigateSpa(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState(null, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

async function expectEnglishSurface(page: Page, stage: string, englishAnchor: Locator) {
  await expect(englishAnchor).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      }),
  );

  const surface = await page.evaluate(() => {
    const exposedAttributes = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[aria-label], [aria-valuetext], [title], [placeholder], [alt]',
      ),
    ).flatMap((element) =>
      ['aria-label', 'aria-valuetext', 'title', 'placeholder', 'alt'].map(
        (attribute) => element.getAttribute(attribute) ?? '',
      ),
    );
    const generatedContent = Array.from(document.body.querySelectorAll('*')).flatMap((element) =>
      ['::before', '::after'].map((pseudo) => window.getComputedStyle(element, pseudo).content),
    );
    return [
      document.title,
      document.body.innerText,
      ...exposedAttributes,
      ...generatedContent,
    ].join('\n');
  });
  const lowerSurface = surface.toLocaleLowerCase('fr-FR');
  const residualMarkers = FRENCH_UI_MARKERS.filter((marker) =>
    lowerSurface.includes(marker.toLocaleLowerCase('fr-FR')),
  );
  const accentedFragments = surface.match(/[àâçéèêëîïôùûüÿœ]+/giu) ?? [];

  expect(
    [...new Set([...residualMarkers, ...accentedFragments])],
    `${stage} still exposes French copy.`,
  ).toEqual([]);
}

async function installJourneyMap(page: Page, stage: 'before-combat' | 'after-combat') {
  await page.evaluate(async (fixtureStage) => {
    const [{ getCanonicalRunItem }, { NodeType }, { useRunStore }] = await Promise.all([
      import('/src/game/inventory/inventoryRules.ts'),
      import('/src/game/map/types.ts'),
      import('/src/stores/runStore.ts'),
    ]);
    const sword = getCanonicalRunItem('long_sword');
    if (!sword) throw new Error('The long_sword fixture item is unavailable.');

    const afterCombat = fixtureStage === 'after-combat';
    const combatEncounter: CombatEncounter = {
      id: 'i18n-journey-combat',
      type: 'combat',
      name: 'Presentation duel',
      description: 'A deterministic duel for the English journey.',
      minRunLevel: 1,
      enemies: [{ championId: 'Malphite', level: 1, statMultiplier: 0.2 }],
      goldReward: 10,
      itemDropChance: 0,
    };
    const treasureEncounter: TreasureEncounter = {
      id: 'i18n-journey-treasure',
      type: 'treasure',
      name: 'Journey treasure',
      description: 'A deterministic reward for the English journey.',
      minRunLevel: 1,
      gold: 25,
    };
    const nodes: MapNode[] = [
      {
        id: 'i18n-journey-start',
        type: NodeType.Start,
        column: 0,
        row: 0,
        nextNodeIds: ['i18n-journey-checkpoint'],
        prevNodeIds: [],
        biome: 'top_lane',
        completed: true,
        accessible: false,
        encounter: null,
        metadata: { title: 'Start', description: 'Path completed.', icon: '▶' },
      },
      {
        id: 'i18n-journey-checkpoint',
        type: NodeType.Rest,
        column: 1,
        row: 0,
        nextNodeIds: ['i18n-journey-combat'],
        prevNodeIds: ['i18n-journey-start'],
        biome: 'top_lane',
        completed: true,
        accessible: false,
        encounter: null,
        metadata: { title: 'Camp', description: 'Current checkpoint.', icon: '✚' },
      },
      {
        id: 'i18n-journey-combat',
        type: NodeType.Combat,
        column: 2,
        row: 0,
        nextNodeIds: ['i18n-journey-treasure'],
        prevNodeIds: ['i18n-journey-checkpoint'],
        biome: 'top_lane',
        completed: afterCombat,
        accessible: !afterCombat,
        encounter: combatEncounter,
        metadata: { title: 'Duel', description: 'Combat available.', icon: '⚔' },
      },
      {
        id: 'i18n-journey-treasure',
        type: NodeType.Treasure,
        column: 3,
        row: 0,
        nextNodeIds: [],
        prevNodeIds: ['i18n-journey-combat'],
        biome: 'top_lane',
        completed: false,
        accessible: afterCombat,
        encounter: treasureEncounter,
        metadata: { title: 'Treasure', description: 'Reward available.', icon: '◇' },
      },
    ];

    useRunStore.setState({
      biomeMaps: [
        {
          biome: 'top_lane',
          startNodeId: 'i18n-journey-start',
          exitNodeId: 'i18n-journey-treasure',
          columns: 4,
          rows: 1,
          nodes,
        },
      ],
      currentBiomeIndex: 0,
      currentBiome: 'top_lane',
      currentNodeId: afterCombat ? 'i18n-journey-combat' : 'i18n-journey-checkpoint',
      chosenPathNodeIds: afterCombat
        ? ['i18n-journey-start', 'i18n-journey-checkpoint', 'i18n-journey-combat']
        : ['i18n-journey-start', 'i18n-journey-checkpoint'],
      completedNodeIds: afterCombat
        ? ['i18n-journey-start', 'i18n-journey-checkpoint', 'i18n-journey-combat']
        : ['i18n-journey-start', 'i18n-journey-checkpoint'],
      frontierNodeIds: [afterCombat ? 'i18n-journey-treasure' : 'i18n-journey-combat'],
      pendingEncounter: null,
      currentEncounter: null,
      pendingAugmentIds: [],
      pendingSpellUpgradeChampionIds: [],
      lastCombatRewards: null,
      claimedEncounterNodeIds: afterCombat ? ['i18n-journey-combat'] : [],
      inventory: afterCombat
        ? [{ instanceId: 'i18n-journey-sword', item: sword, equippedToChampionId: null }]
        : [],
      nextItemInstanceId: afterCombat ? 2 : 1,
    });
  }, stage);
}

async function installCompletedRun(page: Page) {
  await page.evaluate(async () => {
    const [{ buildRunSummaryFromLedger, createRunLedger }, { RUN_INITIAL_STATE }, { useRunStore }] =
      await Promise.all([
        import('/src/game/run/runLedger.ts'),
        import('/src/stores/runInitialState.ts'),
        import('/src/stores/runStore.ts'),
      ]);
    const ledger = createRunLedger(['Garen', 'Lux']);
    ledger.champions.Garen.kills = 1;
    ledger.champions.Garen.damageDealt = 500;
    ledger.gold.earned = 35;
    const teamMembers = ['Garen', 'Lux'].map((championId) => ({
      championId,
      level: 2,
      currentHp: 100,
      currentMp: 0,
    }));
    const summary = buildRunSummaryFromLedger({
      ledger,
      team: teamMembers,
      won: true,
      runLevel: 2,
      wavesCompleted: 2,
      biomesVisited: ['top_lane'],
      goldBalance: 35,
    });
    useRunStore.setState({
      ...structuredClone(RUN_INITIAL_STATE),
      isActive: false,
      runId: 'i18n-journey-finished',
      pendingEncounter: null,
      currentEncounter: null,
      saveStatus: 'saved',
      completedRunSnapshot: {
        runId: 'i18n-journey-finished',
        mode: 'normal',
        won: true,
        runLevel: 2,
        wavesCompleted: 2,
        biomesVisited: ['top_lane'],
        goldEarned: 35,
        goldSpent: 0,
        goldBalance: 35,
        summary,
        teamMembers,
        startedAt: new Date().toISOString(),
        seed: 20260908,
        runeIds: [],
        augmentIds: [],
        ledger,
        daily: null,
      },
    });
  });
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`switches from French to English across a complete player journey (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await keepJourneyOffline(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/auth');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByLabel('Langue')).toHaveValue('fr-FR');
    await expect(page.getByRole('button', { name: 'Jouer en invité' })).toBeVisible();

    await page.getByLabel('Langue').selectOption('en-US');
    await expect(page.getByLabel('Language')).toHaveValue('en-US');
    await expectEnglishSurface(
      page,
      'authentication',
      page.getByRole('button', { name: 'Play as guest' }),
    );

    await page.getByRole('button', { name: 'Play as guest' }).click();
    await expect(page).toHaveURL('/');
    await page.evaluate(() => {
      localStorage.setItem('lolrogue:tutorial:map:v1', 'done');
      localStorage.setItem('lolrogue:tutorial:combat:v1', 'done');
    });
    await expectEnglishSurface(
      page,
      'menu',
      page.getByRole('button', { name: 'Play', exact: true }),
    );

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page).toHaveURL('/starter-select');
    await expectEnglishSurface(
      page,
      'starter selection',
      page.getByRole('heading', { name: 'Build your team' }),
    );

    for (let selected = 0; selected < 2; selected += 1) {
      await page
        .locator('button.champion-card[aria-pressed="false"]:not(:disabled)')
        .first()
        .click();
    }
    const confirmSelection = page.getByRole('button', { name: 'Confirm selection' });
    await expect(confirmSelection).toBeEnabled();
    await expectEnglishSurface(page, 'selected starter badges', confirmSelection);
    await expect(page.locator('button.champion-card[aria-pressed="true"]').first()).toHaveAttribute(
      'data-selected-label',
      'On the team',
    );
    await confirmSelection.click();
    await expect(page).toHaveURL('/run');

    await installJourneyMap(page, 'before-combat');
    await expectEnglishSurface(page, 'run map', page.getByRole('heading', { name: 'Run map' }));
    const combatNode = page.getByRole('button', { name: /Combat, column 3.*accessible/i });
    await expect(combatNode).toBeVisible();
    await combatNode.dispatchEvent('click');
    await expect(page).toHaveURL('/combat');
    await expectEnglishSurface(page, 'combat', page.getByText(/Combat — Round \d+/));

    await installJourneyMap(page, 'after-combat');
    await navigateSpa(page, '/run');
    const inventory = page.getByRole('region', { name: 'Inventory' });
    await expect(inventory.getByText('Long Sword', { exact: true })).toBeVisible();
    await expectEnglishSurface(page, 'inventory', inventory);

    const treasureNode = page.getByRole('button', { name: /Treasure, column 4.*accessible/i });
    await treasureNode.dispatchEvent('click');
    await expect(page).toHaveURL('/treasure');
    await expectEnglishSurface(
      page,
      'treasure encounter',
      page.getByRole('heading', { name: 'Rewards collected!' }),
    );

    await installCompletedRun(page);
    await navigateSpa(page, '/game-over');
    await expectEnglishSurface(page, 'game over', page.getByRole('heading', { name: 'Victory!' }));
  });
}
