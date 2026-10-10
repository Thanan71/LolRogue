import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    /production-matrix\.spec\.ts/,
    // Real connected scenarios run only in their mandatory dedicated CI gate.
    ...(process.env.E2E_REQUIRE_CONNECTED === '1'
      ? []
      : [/(?:connected-(?:daily|sprint-g)|champion-economy-connected)\.spec\.ts$/]),
  ],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // The two full-run scenarios are resource intensive and make Chromium unstable
  // when GitHub's shared runners execute them concurrently.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'VITE_E2E_VICTORY_RUNE=1 npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
