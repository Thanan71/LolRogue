import { expect, type Page, type TestInfo, test } from '@playwright/test';

const REQUIRED_ENCOUNTERS = [
  'combat',
  'elite',
  'shop',
  'rest',
  'event',
  'treasure',
  'exit',
  'boss',
];
const REQUIRED_VICTORY_ENCOUNTERS = ['combat', 'elite', 'exit', 'boss'];
const ENCOUNTER_LABELS: Record<string, string[]> = {
  combat: ['combat'],
  elite: ['elite'],
  shop: ['shop', 'boutique'],
  rest: ['rest', 'repos'],
  event: ['event', 'evenement'],
  treasure: ['treasure', 'tresor'],
  recruit: ['recruit', 'recrutement'],
  exit: ['exit', 'sortie'],
  boss: ['boss'],
};

function labelMatchesEncounter(label: string, encounter: string): boolean {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
  return (ENCOUNTER_LABELS[encounter] ?? [encounter]).some((candidate) =>
    normalized.includes(candidate),
  );
}

async function startNormalGuestRun(page: Page, assuredVictory: boolean) {
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByLabel('Difficulté').selectOption('easy');
  await page.getByRole('button', { name: 'Retour au menu' }).click();
  await page.getByRole('button', { name: 'Jouer', exact: true }).click();

  let offered = await page.getByRole('button', { name: /^Choisir / }).allTextContents();
  for (
    let attempt = 0;
    attempt < 20 && !offered.some((label) => label.includes('Warwick'));
    attempt += 1
  ) {
    await page.waitForTimeout(10);
    await page.reload();
    offered = await page.getByRole('button', { name: /^Choisir / }).allTextContents();
  }
  const preferred = ['Warwick', 'Garen', 'Darius', 'Leona', 'Soraka'];
  const champion = preferred.find((name) => offered.some((label) => label.includes(name)));
  const choice = champion
    ? page.getByRole('button', { name: new RegExp(`^Choisir ${champion}`) })
    : page.getByRole('button', { name: /^Choisir / }).first();
  await choice.click();
  const runes = page.getByRole('checkbox');
  let selected = 0;
  if (assuredVictory) {
    const victoryRune = page.getByRole('checkbox', { name: /E2E — Victoire assurée/ });
    await expect(victoryRune).toBeVisible();
    await victoryRune.check();
    selected = 1;
  }
  for (let index = 0; index < (await runes.count()) && selected < 3; index += 1) {
    if (!(await runes.nth(index).isChecked())) {
      await runes.nth(index).check();
      selected += 1;
    }
  }
  await page.getByRole('button', { name: 'Confirmer le choix' }).click();
  await expect(page).toHaveURL('/run');
  if (assuredVictory) await expect(page.getByText(/e2e_assured_victory/)).toBeVisible();
  const mapTutorial = page.getByRole('dialog', { name: 'Comprendre la carte' });
  await expect(mapTutorial).toBeVisible();
  await mapTutorial.getByRole('button', { name: 'Fermer le tutoriel' }).click();
}

async function resolveCombat(page: Page, trace: string[]) {
  const tutorial = page.getByRole('dialog', { name: 'Ton premier combat' });
  const tutorialOpened = await tutorial
    .waitFor({ state: 'visible', timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  if (tutorialOpened) await tutorial.getByRole('button', { name: 'Fermer le tutoriel' }).click();
  await page.getByRole('radio', { name: 'Vitesse 3x' }).click();
  const outcome = page.getByText(/VICTOIRE !|DÉFAITE/, { exact: true });
  const auto = page.getByRole('button', { name: /Activer le mode automatique/ });
  if (await auto.isVisible()) await auto.click();
  await Promise.race([
    outcome.waitFor({ state: 'visible', timeout: 45_000 }),
    page.waitForURL(/\/(?:run|game-over)$/, { timeout: 45_000 }),
  ]);
  const path = new URL(page.url()).pathname;
  if (path === '/run') {
    trace.push('combat:VICTOIRE');
    return true;
  }
  if (path === '/game-over') {
    trace.push('combat:DÉFAITE');
    return false;
  }
  const text = await outcome.textContent();
  trace.push(`combat:${text}`);
  if (text?.includes('DÉFAITE')) return false;
  await page.getByRole('button', { name: /Continuer/ }).click();
  await expect(page).toHaveURL('/run');
  return true;
}

async function resolveEncounter(page: Page, trace: string[], strategy: 'risky' | 'survival') {
  const path = new URL(page.url()).pathname;
  trace.push(path);
  if (path === '/combat') return resolveCombat(page, trace);
  if (path === '/shop') {
    if (strategy === 'survival') {
      for (let purchase = 0; purchase < 10; purchase += 1) {
        const affordable = page
          .locator('button:enabled')
          .filter({ hasText: /^(Acheter|Recruter) —/ })
          .first();
        if (!(await affordable.isVisible())) break;
        await affordable.click();
      }
    }
    await page.getByRole('button', { name: /Quitter la boutique/ }).click();
  } else if (path === '/rest') {
    const rest = page.getByRole('button', { name: /Se reposer/ });
    if (strategy === 'survival' && (await rest.isEnabled())) {
      await rest.click();
      await page.getByRole('button', { name: /Continuer/ }).click();
    } else await page.getByRole('button', { name: /Passer|Continuer/ }).click();
  } else if (path === '/event') {
    const investigate = page.getByRole('button', { name: /Examiner|Explorer|Enquêter/ });
    await expect(investigate).toBeVisible();
    await investigate.click();
    await page.getByRole('button', { name: /Continue|Continuer/ }).click();
  } else if (path === '/treasure') {
    // TreasurePage claims the encounter automatically once its payload is ready.
    // Clicking the transient collect button races that effect and can wait forever
    // after React removes the button from the page.
    await expect(page.getByText('Récompenses récupérées !')).toBeVisible();
    await page.getByRole('button', { name: /Continuer/ }).click();
  } else if (path === '/recruit') {
    const recruit = page.getByRole('button', { name: /^Recruter —/ });
    if (strategy === 'survival' && (await recruit.count()) > 0 && (await recruit.isEnabled())) {
      await recruit.click();
    }
    await page
      .getByRole('button', { name: /Pass|Quitter|Continue/ })
      .last()
      .click();
  } else throw new Error(`Route de rencontre non pilotée : ${path}`);
  await expect(page).toHaveURL('/run');
  return true;
}

async function resolvePendingChoices(page: Page, trace: string[]) {
  const rewards = page.getByRole('region', { name: /Récompenses du combat/ });
  if (await rewards.isVisible()) {
    trace.push(`rewards:${await rewards.textContent()}`);
    await rewards.getByRole('button', { name: 'Fermer' }).click();
  }
  const augment = page.getByRole('region', { name: "Choix d'augment" });
  if (await augment.isVisible()) {
    const label = await augment.getByRole('button').first().textContent();
    trace.push(`augment:${label}`);
    await augment.getByRole('button').first().click();
  }
  const upgrade = page.getByRole('region', { name: /Amélioration de sort|Améliorer un sort/ });
  for (let choice = 0; choice < 10 && (await upgrade.isVisible()); choice += 1) {
    const button = upgrade.locator('button:enabled').first();
    await expect(button).toBeVisible();
    trace.push(`upgrade:${await button.textContent()}`);
    await button.click();
  }
}

async function playRun(page: Page, testInfo: TestInfo, strategy: 'risky' | 'survival') {
  const trace: string[] = [];
  const visited = new Set<string>();
  await startNormalGuestRun(page, strategy === 'survival');

  for (let step = 0; step < 80; step += 1) {
    if (new URL(page.url()).pathname === '/game-over') break;
    await resolvePendingChoices(page, trace);
    const nodes = page.locator(
      '[role="button"][aria-label*="accessible"]:not([aria-disabled="true"])',
    );
    await expect(nodes.first()).toBeVisible();
    const labels = await nodes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label') ?? ''),
    );
    const priorities =
      strategy === 'risky'
        ? REQUIRED_ENCOUNTERS
        : [
            ...REQUIRED_ENCOUNTERS.filter(
              (type) => !visited.has(type) && type !== 'exit' && type !== 'boss',
            ),
            'rest',
            'treasure',
            'recruit',
            'shop',
            'event',
            'elite',
            'combat',
            'exit',
            'boss',
          ];
    const preferred = priorities.find((type) =>
      labels.some((label) => labelMatchesEncounter(label, type)),
    );
    const index = preferred
      ? labels.findIndex((label) => labelMatchesEncounter(label, preferred))
      : 0;
    const label = labels[index];
    for (const type of REQUIRED_ENCOUNTERS) {
      if (labelMatchesEncounter(label, type)) visited.add(type);
    }
    trace.push(`node:${label}`);
    // Playwright cannot scroll SVG <g> nodes inside the map's nested overflow
    // containers reliably. Dispatch after the accessibility state is verified.
    await nodes.nth(index).dispatchEvent('click');
    if (new URL(page.url()).pathname !== '/run') {
      const survived = await resolveEncounter(page, trace, strategy);
      if (!survived) break;
    }
  }

  await testInfo.attach('ui-run-trace.txt', {
    body: trace.join('\n'),
    contentType: 'text/plain',
  });
  await expect(page).toHaveURL('/game-over');
  const outcome = await page.getByRole('heading', { name: /Victoire|Défaite/ }).textContent();
  expect(trace.length).toBeGreaterThan(5);
  expect([...visited]).toContain('combat');
  return { outcome, visited };
}

test('a guest run reaches a real defeat through the UI', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const result = await playRun(page, testInfo, 'risky');
  expect(result.outcome).toBe('Défaite');
});

test('a guest run can pursue all six biomes through the UI', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const result = await playRun(page, testInfo, 'survival');
  expect(result.outcome).toMatch(/^Victoire/);
  expect([...result.visited]).toEqual(expect.arrayContaining(REQUIRED_VICTORY_ENCOUNTERS));
  expect(result.visited.size).toBeGreaterThanOrEqual(6);
});
