import { defineConfig, devices } from '@playwright/test';

const WEB = 'http://localhost:3400';

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Allow programmatic play() in synced rooms without a user gesture.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'node ../../scripts/e2e-stack.mjs api',
      url: 'http://localhost:4400/api/v1/health/ready',
      timeout: 180_000,
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === '1',
      stdout: 'pipe',
    },
    {
      command: 'node ../../scripts/e2e-stack.mjs web',
      url: WEB,
      timeout: 400_000,
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === '1',
      stdout: 'pipe',
    },
  ],
});
