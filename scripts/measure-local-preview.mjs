import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, devices } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const baseUrl = 'http://127.0.0.1:4174';
const vite = join(root, 'node_modules/vite/bin/vite.js');
const budgets = JSON.parse(
  await readFile(join(root, 'config/performance-budgets.json'), 'utf8'),
).mobileWebVitals;
const sampleCount = 5;
const labProfile = {
  device: 'Pixel 5',
  cpuSlowdownMultiplier: 4,
  network: {
    latencyMs: 150,
    downloadBitsPerSecond: 1_600_000,
    uploadBitsPerSecond: 750_000,
  },
};
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4174'], {
  cwd: root,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Vite preview exited before it was ready.\n${serverOutput}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The preview needs a short startup window before accepting connections.
    }
    await delay(100);
  }
  throw new Error(`Vite preview did not start within 15 seconds.\n${serverOutput}`);
}

async function stopPreview() {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), delay(2_000)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

const vitalsInitScript = String.raw`
  (() => {
    const metrics = { cls: 0, lcp: 0, interactions: {}, eventEntries: 0 };
    Object.assign(window, { __lolRogueLabVitals: metrics });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) metrics.cls += entry.value ?? 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      metrics.lcp = list.getEntries().at(-1)?.startTime ?? metrics.lcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });

    if (PerformanceObserver.supportedEntryTypes.includes('event')) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.eventEntries += 1;
          if (!entry.interactionId) continue;
          const key = String(entry.interactionId);
          metrics.interactions[key] = Math.max(
            metrics.interactions[key] ?? 0,
            entry.duration,
          );
        }
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    }
  })();
`;

async function installVitalsObservers(page) {
  await page.addInitScript({ content: vitalsInitScript });
}

async function readJavaScriptResources(page) {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => {
        const resource = /** @type {{
         *   name: string;
         *   duration: number;
         *   initiatorType: string;
         *   transferSize: number;
         *   encodedBodySize: number;
         *   decodedBodySize: number;
         * }} */ (/** @type {unknown} */ (entry));
        return {
          url: resource.name,
          initiatorType: resource.initiatorType,
          transferBytes: resource.transferSize,
          encodedBodyBytes: resource.encodedBodySize,
          decodedBodyBytes: resource.decodedBodySize,
          durationMs: Number(resource.duration.toFixed(2)),
        };
      })
      .filter((resource) => new URL(resource.url).pathname.endsWith('.js')),
  );
}

async function measureSample(browser, sampleNumber) {
  const context = await browser.newContext({ ...devices['Pixel 5'] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: labProfile.network.latencyMs,
    downloadThroughput: labProfile.network.downloadBitsPerSecond / 8,
    uploadThroughput: labProfile.network.uploadBitsPerSecond / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: labProfile.cpuSlowdownMultiplier,
  });
  await installVitalsObservers(page);

  const startedAt = Date.now();
  await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'LoL Rogue' }).waitFor();
  await delay(250);
  const resources = await readJavaScriptResources(page);

  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByText('Mode invité').waitFor();
  await delay(500);

  const vitals = await page.evaluate(() => {
    const value = /** @type {{
     *   cls: number;
     *   lcp: number;
     *   interactions: Record<string, number>;
     *   eventEntries: number;
     * }} */ (/** @type {unknown} */ (Reflect.get(globalThis, '__lolRogueLabVitals')));
    const interactions = Object.values(value.interactions);
    return {
      lcpMs: Number(value.lcp.toFixed(2)),
      cls: Number(value.cls.toFixed(4)),
      inpMs: Number(Math.max(0, ...interactions).toFixed(2)),
      interactionCount: interactions.length,
      eventEntries: value.eventEntries,
    };
  });

  await context.close();
  if (vitals.lcpMs <= 0) throw new Error(`Sample ${sampleNumber} did not observe LCP.`);
  if (vitals.inpMs <= 0 || vitals.interactionCount === 0) {
    throw new Error(`Sample ${sampleNumber} did not observe a real INP interaction.`);
  }

  return {
    sample: sampleNumber,
    navigationDurationMs: Date.now() - startedAt,
    vitals,
    resources,
  };
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const warmup = await measureSample(browser, 0);
  const samples = [];
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    samples.push(await measureSample(browser, sample));
  }

  const loadedChunks = samples[0].resources
    .map((resource) => ({ ...resource, file: new URL(resource.url).pathname.slice(1) }))
    .sort(
      (left, right) =>
        right.transferBytes - left.transferBytes || left.file.localeCompare(right.file),
    );
  const deferredChunkNames = ['champion-data-', 'AdminPage-', 'DatabasePage-', 'LegalPage-'];
  const deferredLeaks = loadedChunks.filter((chunk) =>
    deferredChunkNames.some((name) => chunk.file.includes(name)),
  );
  if (deferredLeaks.length) {
    throw new Error(
      `Auth preview loaded deferred chunks: ${deferredLeaks.map((chunk) => chunk.file).join(', ')}`,
    );
  }

  const aggregate = {
    percentile: 0.75,
    lcpMs: percentile(
      samples.map((sample) => sample.vitals.lcpMs),
      0.75,
    ),
    cls: percentile(
      samples.map((sample) => sample.vitals.cls),
      0.75,
    ),
    inpMs: percentile(
      samples.map((sample) => sample.vitals.inpMs),
      0.75,
    ),
  };
  const failures = [
    ['lcpMs', aggregate.lcpMs, budgets.lcpMs],
    ['cls', aggregate.cls, budgets.cls],
    ['inpMs', aggregate.inpMs, budgets.inpMs],
  ].filter(([, measured, budget]) => measured > budget);

  const reportDirectory = join(root, 'performance-report');
  await mkdir(reportDirectory, { recursive: true });
  const commonReport = {
    schemaVersion: 2,
    measuredAt: new Date().toISOString(),
    commitSha: process.env.APP_COMMIT_SHA?.trim() || process.env.GITHUB_SHA?.trim() || 'local',
    preview: { command: 'vite preview', route: '/auth', browser: 'chromium' },
  };
  const previewReport = {
    ...commonReport,
    measurements: {
      loadedJavaScriptChunks: loadedChunks.length,
      transferredJavaScriptBytes: loadedChunks.reduce(
        (sum, resource) => sum + resource.transferBytes,
        0,
      ),
      encodedJavaScriptBodyBytes: loadedChunks.reduce(
        (sum, resource) => sum + resource.encodedBodyBytes,
        0,
      ),
    },
    deferredChunkLeaks: deferredLeaks.map((chunk) => chunk.file),
    chunks: loadedChunks,
  };
  const webVitalsReport = {
    ...commonReport,
    profile: labProfile,
    budgets,
    warmup: {
      navigationDurationMs: warmup.navigationDurationMs,
      ...warmup.vitals,
    },
    samples: samples.map(({ sample, navigationDurationMs, vitals }) => ({
      sample,
      navigationDurationMs,
      ...vitals,
    })),
    aggregate,
  };
  await Promise.all([
    writeFile(
      join(reportDirectory, 'preview-report.json'),
      `${JSON.stringify(previewReport, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      join(reportDirectory, 'web-vitals-report.json'),
      `${JSON.stringify(webVitalsReport, null, 2)}\n`,
      'utf8',
    ),
  ]);

  console.table(webVitalsReport.samples);
  console.table({
    lcp: { measured: aggregate.lcpMs, budget: budgets.lcpMs },
    cls: { measured: aggregate.cls, budget: budgets.cls },
    inp: { measured: aggregate.inpMs, budget: budgets.inpMs },
  });
  console.log(
    `Real preview /auth: ${loadedChunks.length} JavaScript chunks, ` +
      `${previewReport.measurements.transferredJavaScriptBytes} transferred bytes.`,
  );
  console.log('Preview and Web Vitals reports written to performance-report/.');
  if (failures.length) {
    throw new Error(
      `Lab Web Vitals budget exceeded: ${failures
        .map(([name, measured, budget]) => `${name}=${measured} (budget ${budget})`)
        .join(', ')}`,
    );
  }
} finally {
  await browser?.close();
  await stopPreview();
}
