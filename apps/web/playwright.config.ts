import { defineConfig, devices } from '@playwright/test';
import { API_URL, E2E_SESSION_SECRET, WEB_URL } from './e2e/support/env';

const API_PORT = new URL(API_URL).port;
const WEB_PORT = new URL(WEB_URL).port;

// Needs a migrated and seeded test database; see README "E2E tests".
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  // Deletes the e2e drivers and vehicles that assignments keep from the API.
  globalTeardown: './e2e/support/global-teardown.ts',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      cwd: '../api',
      command: 'npm run build && node dist/main',
      env: { NODE_ENV: 'test', PORT: API_PORT },
      url: `${API_URL}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: `npm run build && npx next start --port ${WEB_PORT}`,
      env: {
        API_BASE_URL: API_URL,
        SESSION_SECRET: E2E_SESSION_SECRET,
      },
      url: `${WEB_URL}/login`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
