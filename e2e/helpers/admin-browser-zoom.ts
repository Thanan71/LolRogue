import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BrowserContext, chromium, expect, type Page } from '@playwright/test';

/** A disposable extension changes Chromium tab zoom without touching OS or personal profiles. */
export async function browserZoomContext(baseURL: string) {
  const origin = new URL(baseURL);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
    throw new Error('Browser zoom proof requires a loopback origin');
  const directory = await mkdtemp(join(tmpdir(), 'lolrogue-admin-zoom-'));
  const extension = join(directory, 'extension');
  await mkdir(extension);
  await writeFile(
    join(extension, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'Disposable administration zoom proof',
      version: '1.0',
      host_permissions: [`${origin.protocol}//${origin.hostname}/*`],
      background: { service_worker: 'background.js' },
    }),
  );
  await writeFile(join(extension, 'background.js'), 'void 0;');
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(join(directory, 'profile'), {
      channel: 'chromium',
      headless: true,
      viewport: null,
      deviceScaleFactor: undefined,
      isMobile: false,
      baseURL,
      args: [
        '--window-size=1280,900',
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
      ],
    });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return {
    context,
    async setZoom(page: Page, factor: 2 | 4) {
      const zoom = await worker.evaluate(
        `(async () => {
          const [tab] = await chrome.tabs.query({ active: true });
          await chrome.tabs.setZoom(tab.id, ${factor});
          return chrome.tabs.getZoom(tab.id);
        })()`,
      );
      expect(zoom).toBeCloseTo(factor);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1280 / factor);
      const cdp = await context.newCDPSession(page);
      try {
        const metrics = await cdp.send('Page.getLayoutMetrics');
        const browser = await page.evaluate(() => ({
          innerWidth,
          devicePixelRatio,
          visualScale: visualViewport?.scale,
          documentWidth: document.documentElement.scrollWidth,
        }));
        expect(metrics.cssVisualViewport.zoom).toBeCloseTo(factor);
        expect(browser.devicePixelRatio).toBeCloseTo(factor);
        expect(browser.visualScale).toBe(1);
        return { zoom, browser, viewport: metrics.cssVisualViewport };
      } finally {
        await cdp.detach();
      }
    },
    async screenshot(page: Page, path: string) {
      const cdp = await context.newCDPSession(page);
      try {
        // At real browser zoom the capture surface uses device-independent pixels,
        // while Playwright's fullPage CSS clip would cut away most of that surface.
        const { contentSize } = await cdp.send('Page.getLayoutMetrics');
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { ...contentSize, scale: 1 },
        });
        await writeFile(path, Buffer.from(screenshot.data, 'base64'));
      } finally {
        await cdp.detach();
      }
    },
    async close() {
      try {
        await context.close();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
