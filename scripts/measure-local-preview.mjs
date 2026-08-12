import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const baseUrl = 'http://127.0.0.1:4174';
const vite = join(root, 'node_modules/vite/bin/vite.js');
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

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const startedAt = Date.now();
  await page.goto(`${baseUrl}/auth`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'LoL Rogue' }).waitFor();

  const resources = await page.evaluate(() =>
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
  const loadedChunks = resources
    .map((resource) => ({ ...resource, file: new URL(resource.url).pathname.slice(1) }))
    .sort(
      (left, right) =>
        right.transferBytes - left.transferBytes || left.file.localeCompare(right.file),
    );
  const deferredChunkNames = ['champion-data-', 'AdminPage-', 'DatabasePage-', 'LegalPage-'];
  const deferredLeaks = loadedChunks.filter((chunk) =>
    deferredChunkNames.some((name) => chunk.file.includes(name)),
  );
  console.table(loadedChunks);
  if (deferredLeaks.length) {
    throw new Error(
      `Auth preview loaded deferred chunks: ${deferredLeaks.map((chunk) => chunk.file).join(', ')}`,
    );
  }

  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    commitSha: process.env.APP_COMMIT_SHA?.trim() || process.env.GITHUB_SHA?.trim() || 'local',
    preview: { command: 'vite preview', route: '/auth', browser: 'chromium' },
    measurements: {
      navigationDurationMs: Date.now() - startedAt,
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
  const reportDirectory = join(root, 'performance-report');
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    join(reportDirectory, 'preview-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `Real preview /auth: ${report.measurements.loadedJavaScriptChunks} JavaScript chunks, ` +
      `${report.measurements.transferredJavaScriptBytes} transferred bytes.`,
  );
  console.log('Deferred champion, admin, database and legal chunks were not requested.');
  console.log('Preview report written to performance-report/preview-report.json.');
} finally {
  await browser?.close();
  await stopPreview();
}
