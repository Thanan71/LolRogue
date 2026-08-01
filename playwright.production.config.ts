import { defineConfig, devices } from '@playwright/test';

const productionTest = /production-matrix\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  testMatch: productionTest,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Web-vital lab measurements need uncontended CPU to remain meaningful.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium-production', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-production', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-production', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium-production', use: { ...devices['Pixel 5'] } },
    {
      name: 'mobile-firefox-production',
      use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    { name: 'mobile-webkit-production', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command:
      'VITE_E2E_VICTORY_RUNE=1 npm run build && npm run preview -- --host 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
