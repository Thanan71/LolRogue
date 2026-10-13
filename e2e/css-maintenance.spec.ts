import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  CHAMPION_CATALOG_VERSION,
  CHAMPION_ECONOMY_CATALOG,
  CHAMPION_ECONOMY_VERSION,
  getRotationForInstant,
} from '@/domain/championEconomy';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionCapabilities.generated';

const instant = '2026-02-02T12:00:00.000Z';
const phase = process.env.CSS_AUDIT_PHASE;
const captureEnabled = phase === 'before' || phase === 'after';
const captureDirectory = process.env.CSS_AUDIT_OUTPUT ?? 'test-results/css-maintenance';
const surfaces = [
  ['menu', '/', 'LoL Rogue'],
  ['settings', '/settings', 'Réglages'],
  ['starter', '/starter-select', 'Compose ton équipe'],
  ['database', '/database', 'Base des champions'],
] as const;

async function prepare(page: Page) {
  await page.clock.setFixedTime(instant);
  await page.addInitScript(() => {
    let seed = 17;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    localStorage.setItem('lolrogue:tutorial:map:v1', 'done');
    localStorage.setItem('lolrogue:tutorial:combat:v1', 'done');
    localStorage.setItem(
      'lolrogue:patch-notes:v1:guest',
      JSON.stringify({
        version: 1,
        lastSeenSequence: 11,
        lastSeenVersion: '0.2.6',
        pendingSync: false,
      }),
    );
  });
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === '127.0.0.1' || host === 'localhost'
      ? route.continue()
      : route.abort('blockedbyclient');
  });
  await page.route('**/rpc/get_champion_economy_snapshot', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        enabled: true,
        economyVersion: CHAMPION_ECONOMY_VERSION,
        catalogVersion: CHAMPION_CATALOG_VERSION,
        gameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
        serverNow: instant,
        rotation: getRotationForInstant(instant, CURRENT_AUTHORITY_VERSION.gameplay),
        catalog: [...CHAMPION_ECONOMY_CATALOG],
        wallet: null,
        ownedChampionIds: [],
        firstWinChampionIds: [],
      },
    }),
  );
}

async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (image) => {
        image.loading = 'eager';
        try {
          await image.decode();
        } catch {
          // Missing optional artwork uses the component's existing themed fallback.
        }
      }),
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  const assets = await page.locator('img[src^="/assets/riot/"]').evaluateAll((images) =>
    images.map((element) => {
      const image = element as HTMLImageElement;
      return { source: image.getAttribute('src'), width: image.naturalWidth };
    }),
  );
  expect(
    assets.filter((asset) => asset.width === 0),
    `${name}: required local artwork`,
  ).toEqual([]);
  if (name.endsWith('-combat-focus')) {
    expect(assets.some((asset) => asset.source?.endsWith('/champions/Annie.png'))).toBe(true);
    expect(assets.some((asset) => asset.source?.endsWith('/champions/Warwick.png'))).toBe(true);
    expect(assets.some((asset) => asset.source?.includes('/spells/'))).toBe(true);
  }
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = [
      ...document.querySelectorAll<HTMLElement>('main, h1, button, input, select'),
    ].filter(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.closest('details:not([open]) > :not(summary)'),
    );
    return {
      viewport: { width: innerWidth, height: innerHeight },
      overflow: root.scrollWidth - root.clientWidth,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      contrastLabelBounds: (() => {
        const label = document.querySelector(
          '.combat-command__target > .combat-command__step-label',
        );
        if (!label) return null;
        const box = label.getBoundingClientRect();
        return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
      })(),
      styles: visible.map((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className,
          text: element.textContent?.trim().slice(0, 80),
          color: style.color,
          background: style.background,
          border: style.border,
          outline: style.outline,
          font: style.font,
          opacity: style.opacity,
          size: [box.width, box.height],
        };
      }),
    };
  });
  expect(metrics.overflow, name).toBeLessThanOrEqual(1);
  expect(metrics.reducedMotion, `${name}: reduced-motion preference`).toBe(true);
  const contrast = metrics.forcedColors
    ? null
    : await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const systemColors = metrics.forcedColors
    ? await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:fixed;visibility:hidden;color:CanvasText;background:Canvas';
        document.body.append(probe);
        const canvasText = getComputedStyle(probe).color;
        probe.style.color = 'ButtonText';
        probe.style.background = 'ButtonFace';
        const buttonText = getComputedStyle(probe).color;
        const buttonFace = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const paragraph = document.querySelector('.champion-economy p');
        const button = document.querySelector('button');
        if (!paragraph || !button) throw new Error('Missing forced-colors presentation controls');
        return {
          canvasText,
          buttonText,
          buttonFace,
          paragraph: getComputedStyle(paragraph).color,
          button: getComputedStyle(button).color,
          background: getComputedStyle(button).backgroundColor,
          border: getComputedStyle(button).borderStyle,
        };
      })
    : null;
  if (captureEnabled) {
    const directory = path.resolve(captureDirectory, phase);
    await mkdir(directory, { recursive: true });
    await page.screenshot({
      path: path.join(directory, `${name}.png`),
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });
    await writeFile(
      path.join(directory, `${name}.json`),
      JSON.stringify({ ...metrics, assets, contrast: contrast?.violations ?? [], systemColors }),
    );
  }
  if (systemColors) {
    expect(systemColors.paragraph).toBe(systemColors.canvasText);
    expect(systemColors.button).toBe(systemColors.buttonText);
    expect(systemColors.background).toBe(systemColors.buttonFace);
    expect(systemColors.border).not.toBe('none');
  }
  // Record the single existing combat defect in the before audit; after and CI require zero.
  const unexpectedContrast = (contrast?.violations ?? []).filter(
    (violation) =>
      !(
        phase === 'before' &&
        name.endsWith('-combat-focus') &&
        violation.id === 'color-contrast' &&
        violation.nodes.every(
          (node) =>
            node.target.length === 1 &&
            node.target[0] === '.combat-command__target > .combat-command__step-label',
        )
      ),
  );
  expect(
    unexpectedContrast.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
    `${name}: contrast`,
  ).toEqual([]);
}

async function focusFirstControl(page: Page) {
  await page.keyboard.press('Tab');
  const control = page
    .locator('button:not(:disabled), input:not(:disabled), select:not(:disabled)')
    .first();
  await control.focus();
  await expect(control).toBeFocused();
  const outline = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'reflow-400', width: 320, height: 225 },
] as const) {
  test(`shared CSS surfaces preserve rendering and accessibility at ${viewport.name}`, async ({
    page,
  }) => {
    // Each journey visits six routes and runs contrast checks on seven surfaces.
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepare(page);
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: 'LoL Rogue', exact: true })).toBeVisible();
    await focusFirstControl(page);
    await capture(page, `${viewport.name}-auth-focus`);
    await page.getByRole('button', { name: 'Jouer en invité' }).click();
    await expect(page).toHaveURL('/');

    for (const [name, route, heading] of surfaces) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      if (name === 'starter') {
        await expect(page.locator('.champion-economy__controls')).toBeVisible();
        await page.locator('.starter-select__rune-disclosure summary').click();
      }
      await focusFirstControl(page);
      await capture(page, `${viewport.name}-${name}-focus`);
    }

    await page.evaluate(async () => {
      const { useRunStore } = await import('/src/stores/runStore.ts');
      const started = await useRunStore.getState().startRun(['Annie', 'Ashe'], { seed: 20260801 });
      if (!started.success) throw new Error(`CSS capture run: ${started.code}`);
    });
    await page.goto('/run');
    await expect(page.getByRole('button', { name: /tutoriel carte/i })).toBeVisible();
    const start = page.getByRole('button', { name: /départ du biome.*accessible/i }).first();
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL('/combat');
    await expect(page.getByText(/Combat — Tour/)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { useBattleStore } = await import('/src/stores/battleStore.ts');
          const battle = useBattleStore.getState();
          return { phase: battle.phase, side: battle.currentTurnSide };
        }),
      )
      .toEqual({ phase: 'turn_active', side: 'player' });
    await focusFirstControl(page);
    await capture(page, `${viewport.name}-combat-focus`);

    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.goto('/database');
    await expect(page.getByRole('heading', { name: 'Base des champions' })).toBeVisible();
    await focusFirstControl(page);
    await capture(page, `${viewport.name}-database-forced-colors`);
  });
}
