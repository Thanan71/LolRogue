import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Render the existing vector identity; no new artwork or remote assets.
const svg = await readFile('public/favicon.svg', 'utf8');
await mkdir('public/pwa', { recursive: true });
const browser = await chromium.launch();
/** @type {Array<[string, number, number]>} */
const iconSizes = [
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['maskable-512.png', 512, 0.2],
  ['apple-touch-icon.png', 180, 0.1],
];
try {
  for (const [file, size, inset] of iconSizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><head><style>
      html,body{margin:0;width:100%;height:100%;background:#071019}
      svg{position:absolute;inset:${inset * 100}%;width:${(1 - 2 * inset) * 100}%;height:${(1 - 2 * inset) * 100}%}
      </style></head><body>${svg}</body></html>`);
    await page.screenshot({ path: `public/pwa/${file}` });
    await page.close();
  }
} finally {
  await browser.close();
}
