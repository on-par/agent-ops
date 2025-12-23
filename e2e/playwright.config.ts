import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,  // Accept self-signed certs
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
