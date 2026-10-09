import { expect, type Page, test } from '@playwright/test';

const COUNTER = 'veigar.phenomenal_power';
const SEED = 3;

/** Only roster access is mocked: combat, gains, biome transitions and saves use the real engine. */
async function allowVeigarInGuestRotation(page: Page) {
  await page.evaluate(async () => {
    const [{ useChampionEconomyStore }, { CHAMPION_ECONOMY_CATALOG }] = await Promise.all([
      import('/src/stores/championEconomyStore.ts'),
      import('/src/domain/championEconomy.ts'),
    ]);
    const clock = Date.parse('2026-10-09T12:00:00Z');
    await useChampionEconomyStore.getState().initialize(null);
    useChampionEconomyStore.setState({
      userId: null,
      status: 'ready',
      error: null,
      snapshot: {
        enabled: true,
        economyVersion: 1,
        catalogVersion: 2,
        gameplayRulesetVersion: 22,
        serverNow: new Date(clock).toISOString(),
        wallet: null,
        ownedChampionIds: [],
        firstWinChampionIds: [],
        catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
        rotation: {
          id: '2026-W41-v1-r22',
          startsAt: '2026-10-05T00:00:00Z',
          endsAt: '2026-10-12T00:00:00Z',
          championIds: ['Veigar', 'Darius', 'Jinx', 'Leona', 'Lux'],
          rulesetVersion: 22,
          algorithmVersion: 1,
        },
      },
      getServerNow: () => clock,
      refresh: async () => undefined,
    });
  });
}

async function selectRun(page: Page, newRun: boolean) {
  await allowVeigarInGuestRotation(page);
  // The selection page captures Date.now as its map seed. Restore the wall clock
  // before starting: roster expiry and persistence are not tested with a 1970 date.
  if (!newRun)
    await page.evaluate((seed) => {
      const clockWindow = window as Window & { __veigarRestoreNow?: typeof Date.now };
      clockWindow.__veigarRestoreNow = Date.now;
      Date.now = () => seed;
    }, SEED);
  await page
    .getByRole('button', { name: newRun ? 'Abandonner et recommencer' : 'Jouer', exact: true })
    .click();
  await expect(page).toHaveURL('/starter-select');
  await expect(page.getByLabel('Rechercher un champion')).toBeVisible();
  if (!newRun)
    await page.evaluate(() => {
      const clockWindow = window as Window & { __veigarRestoreNow?: typeof Date.now };
      if (clockWindow.__veigarRestoreNow) Date.now = clockWindow.__veigarRestoreNow;
      delete clockWindow.__veigarRestoreNow;
    });
  const search = page.getByLabel('Rechercher un champion');
  await search.fill('Veigar');
  await page.getByRole('button', { name: /^Choisir Veigar/ }).click();
  await search.fill('Garen');
  await page.getByRole('button', { name: /^Choisir Garen/ }).click();
  await expect(page.locator('.starter-select__selection-status')).toContainText('2/2');
  await page.locator('.starter-select__rune-disclosure summary').click();
  const rune = page.getByRole('checkbox', { name: /E2E — Victoire assurée/ });
  await expect(rune).toBeVisible();
  await rune.focus();
  await page.keyboard.press('Space');
  await expect(rune).toBeChecked();
  await page.getByRole('button', { name: 'Confirmer le choix' }).click();
  await expect(page).toHaveURL('/run');
  const start = await readRun(page);
  if (!newRun) expect(start.seed).toBe(SEED);
  expect(start.guest).toBe(true);
  expect(start.authorityAttempt).toBeNull();
  expect(start.counter).toBe(0);
  expect(start.teamIds).toEqual(['Veigar', 'Garen']);
  expect(start.runeOwner).toBe('Veigar');
}

async function readRun(page: Page) {
  return page.evaluate(async () => {
    const [{ useRunStore }, { useAuthStore }, { assignTeamRuneBudget }] = await Promise.all([
      import('/src/stores/runStore.ts'),
      import('/src/stores/authStore.ts'),
      import('/src/game/runes/runeAssignment.ts'),
    ]);
    const state = useRunStore.getState();
    const member = state.team.find((candidate) => candidate.championId === 'Veigar');
    const assignments = assignTeamRuneBudget(
      state.team.map((candidate) => candidate.championId),
      state.runeIds,
    );
    return {
      seed: state.seed,
      runId: state.runId,
      biome: state.currentBiomeIndex,
      counter: member?.runProgress?.['veigar.phenomenal_power'] ?? 0,
      teamIds: state.team.map((candidate) => candidate.championId),
      guest: useAuthStore.getState().isGuest,
      authorityAttempt: state.authorityAttempt,
      runeOwner:
        Object.entries(assignments).find(([, ids]) => ids.includes('e2e_assured_victory'))?.[0] ??
        null,
    };
  });
}

async function closeCombatTutorial(page: Page) {
  const tutorial = page.getByRole('dialog', { name: 'Ton premier combat' });
  const completed = await page.evaluate(async () => {
    const { readTutorialCompleted } = await import('/src/utils/ancillaryStorage.ts');
    return readTutorialCompleted('lolrogue:tutorial:combat:v2');
  });
  if (!completed) {
    await expect(tutorial).toBeVisible();
    await tutorial.getByRole('button', { name: 'Fermer le tutoriel' }).click();
    await expect(tutorial).not.toBeVisible();
  }
  await page.getByRole('radio', { name: 'Vitesse 3×' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useBattleStore } = await import('/src/stores/battleStore.ts');
        return useBattleStore.getState().phase;
      }),
    )
    .toBe('turn_active');
}

async function finishCombat(page: Page) {
  const auto = page.locator('.combat-auto-toggle');
  if (await auto.isVisible()) {
    if ((await auto.getAttribute('aria-pressed')) !== 'true') await auto.click();
  }
  await Promise.race([
    page.getByText('VICTOIRE !', { exact: true }).waitFor({ timeout: 90_000 }),
    page.waitForURL('/run', { timeout: 90_000 }),
  ]);
  if (new URL(page.url()).pathname === '/combat')
    await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page).toHaveURL('/run');
}

async function clearRunChoices(page: Page) {
  const rewards = page.getByRole('region', { name: /Récompenses du combat/ });
  if (await rewards.isVisible()) await rewards.getByRole('button', { name: 'Fermer' }).click();
  for (let index = 0; index < 20; index += 1) {
    const pending = await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      const state = useRunStore.getState();
      return state.pendingAugmentIds.length + state.pendingSpellUpgradeChampionIds.length;
    });
    if (pending === 0) return;
    const augment = page.getByRole('region', { name: "Choix d'amélioration" });
    if (await augment.isVisible()) await augment.getByRole('button').first().click();
    else await page.locator('.spell-upgrade__confirm:enabled').click();
  }
  throw new Error('Run choices were not resolved through the UI.');
}

async function resolveEncounter(page: Page) {
  const route = new URL(page.url()).pathname;
  if (route === '/combat') {
    await closeCombatTutorial(page);
    await finishCombat(page);
  } else if (route === '/shop')
    await page.getByRole('button', { name: /Quitter la boutique/ }).click();
  else if (route === '/rest') await page.getByRole('button', { name: /Passer|Continuer/ }).click();
  else if (route === '/event') {
    await page.getByRole('button', { name: /Examiner|Explorer|Enquêter/ }).click();
    await page.getByRole('button', { name: /Continuer/ }).click();
  } else if (route === '/treasure') {
    await expect(page.getByText('Récompenses récupérées !')).toBeVisible();
    await page.getByRole('button', { name: /Continuer/ }).click();
  } else if (route === '/recruit')
    await page
      .getByRole('button', { name: /Pass|Quitter|Continuer/ })
      .last()
      .click();
  else if (route !== '/run') throw new Error(`Unexpected encounter route: ${route}`);
  await expect(page).toHaveURL('/run');
}

test('Veigar gains run power from a real spell kill, keeps it across a biome and reload, then resets in a new run', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.evaluate(() => localStorage.setItem('lolrogue:tutorial:map:v1', 'done'));
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByLabel('Difficulté').selectOption('easy');
  await page.getByLabel('Taille du texte').selectOption('small');
  await page.getByRole('button', { name: 'Retour au menu' }).click();
  await selectRun(page, false);
  const initial = await readRun(page);

  const entry = page.locator('[data-map-node="node_top_lane_0"]');
  await expect(entry).toHaveAttribute('role', 'button');
  await expect(entry).toHaveClass(/run-map-node--selectable/);
  await expect(entry).not.toHaveAttribute('aria-disabled', 'true');
  await entry.dispatchEvent('click');
  await expect(page).toHaveURL('/combat');
  await closeCombatTutorial(page);
  const counter = page
    .locator('.combatant-portrait--player')
    .filter({ hasText: 'Veigar' })
    .locator(`[data-counter-key="${COUNTER}"]`);
  await expect(counter).toHaveAttribute('data-counter-value', '0');
  expect(
    await counter.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(12);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useBattleStore } = await import('/src/stores/battleStore.ts');
        const state = useBattleStore.getState();
        return `${state.currentTurnSide}:${state.currentTurnChampionId}`;
      }),
    )
    .toBe('player:Veigar');
  const spell = page.locator('.combat-ability[aria-keyshortcuts="Q"]');
  await expect(spell).toHaveAttribute('aria-disabled', 'false');
  await spell.click();
  await page.locator('.combatant-portrait--enemy[role="button"]').first().click();
  const confirm = page.locator('.combat-action-button--confirm');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  // This first encounter has one enemy, so the winning kill immediately returns
  // to the map. Inspect the engine snapshot, then test live rendering below.
  await expect(page).toHaveURL('/run');
  expect((await readRun(page)).counter).toBe(1);
  const firstGain = await page.evaluate(async () => {
    const { useBattleStore } = await import('/src/stores/battleStore.ts');
    const state = useBattleStore.getState();
    return {
      counter: state.playerTeam.find((member) => member.id === 'Veigar')?.runProgress?.[
        'veigar.phenomenal_power'
      ],
      gain: state.log.find((event) => event.type === 'run_counter_gain'),
    };
  });
  expect(firstGain).toMatchObject({
    counter: 1,
    gain: {
      amount: 1,
      counterKey: COUNTER,
      counterValue: 1,
      sourceSide: 'player',
      targetSide: 'enemy',
    },
  });
  const gain = firstGain.gain;
  expect(gain).toMatchObject({
    counterKey: COUNTER,
    amount: 1,
    counterValue: 1,
    sourceCombatantId: 'Veigar',
    sourceSide: 'player',
    targetSide: 'enemy',
  });
  expect(gain?.targetCombatantId).toBeTruthy();
  await finishCombat(page);

  for (let step = 0; (await readRun(page)).biome === 0 && step < 20; step += 1) {
    await clearRunChoices(page);
    const node = page.locator('[data-map-node][role="button"]:not([aria-disabled="true"])').first();
    await expect(node).toBeVisible();
    await node.dispatchEvent('click');
    await resolveEncounter(page);
  }
  await clearRunChoices(page);
  const progressed = await readRun(page);
  expect(progressed.biome).toBe(1);
  expect(progressed.counter).toBeGreaterThan(0);
  expect(progressed.counter).toBeLessThanOrEqual(200);
  const sheet = page.getByRole('region', { name: 'Équipe', exact: true });
  await sheet.getByRole('button', { name: /Sélectionner Veigar/ }).click();
  const persistedCounter = sheet.locator(`[data-counter-key="${COUNTER}"]`);
  await expect(persistedCounter).toHaveAttribute('data-counter-value', String(progressed.counter));
  await expect(persistedCounter).toContainText(`+${progressed.counter} AP`);
  const ap = await sheet.locator('[data-stat="abilityPower"] dd').textContent();
  await page.reload();
  await expect(page).toHaveURL('/run');
  expect(await readRun(page)).toMatchObject({
    runId: initial.runId,
    biome: 1,
    counter: progressed.counter,
  });
  await sheet.getByRole('button', { name: /Sélectionner Veigar/ }).click();
  await expect(persistedCounter).toHaveAttribute('data-counter-value', String(progressed.counter));
  await expect(sheet.locator('[data-stat="abilityPower"] dd')).toHaveText(ap!);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  // Seed 3 starts the Jungle with two Malphites. A non-winning spell kill
  // exposes the live counter and log, and distinct target IDs prevent ambiguity.
  const jungle = page.locator('[data-map-node="node_jungle_0"]');
  await expect(jungle).toHaveClass(/run-map-node--selectable/);
  await jungle.dispatchEvent('click');
  await expect(page).toHaveURL('/combat');
  await closeCombatTutorial(page);
  await expect(page.locator('.combatant-portrait--enemy')).toHaveCount(2);
  const targetIds = await page.evaluate(async () => {
    const { useBattleStore } = await import('/src/stores/battleStore.ts');
    return useBattleStore.getState().enemyTeam.map((member) => member.targetId);
  });
  expect(new Set(targetIds).size).toBe(2);
  await expect(counter).toHaveAttribute('data-counter-value', String(progressed.counter));
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useBattleStore } = await import('/src/stores/battleStore.ts');
        const state = useBattleStore.getState();
        return `${state.currentTurnSide}:${state.currentTurnChampionId}`;
      }),
    )
    .toBe('player:Veigar');
  await spell.click();
  await page.locator('.combatant-portrait--enemy[role="button"]').first().click();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  const liveValue = progressed.counter + 1;
  await expect(counter).toHaveAttribute('data-counter-value', String(liveValue));
  await expect(counter).toContainText(`+${liveValue} AP`);
  const gainLog = page.locator(
    `.combat-log__entry--run_counter_gain[data-counter-key="${COUNTER}"]`,
  );
  await expect(gainLog).toHaveAttribute('data-counter-amount', '1');
  await expect(gainLog).toHaveAttribute('data-counter-value', String(liveValue));
  const liveGain = await page.evaluate(async () => {
    const { useBattleStore } = await import('/src/stores/battleStore.ts');
    return useBattleStore.getState().log.find((event) => event.type === 'run_counter_gain');
  });
  expect(liveGain).toMatchObject({
    sourceCombatantId: 'Veigar',
    targetCombatantId: targetIds[0],
    sourceSide: 'player',
    targetSide: 'enemy',
    counterKey: COUNTER,
    amount: 1,
    counterValue: liveValue,
  });
  await finishCombat(page);

  await page.getByRole('button', { name: /Menu$/, exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await selectRun(page, true);
  const fresh = await readRun(page);
  expect(fresh.runId).not.toBe(initial.runId);
  expect(fresh.counter).toBe(0);
  await expect(sheet.locator(`[data-counter-key="${COUNTER}"]`)).toHaveAttribute(
    'data-counter-value',
    '0',
  );
  await testInfo.attach('run-progression-evidence.json', {
    body: JSON.stringify(
      {
        mode: 'guest',
        rosterAccess: 'fixture',
        battle: 'real engine with E2E victory rune',
        gain,
        liveGain,
        progressed,
        reloadedCounter: progressed.counter,
        fresh,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});
