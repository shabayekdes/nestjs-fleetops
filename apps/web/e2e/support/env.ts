// Test-only secret shared by the web server (playwright.config.ts) and the
// helper that forges session cookies. Not a real secret.
export const E2E_SESSION_SECRET =
  'e2e-only-session-secret-0123456789abcdef-not-for-production';
export const WEB_URL = 'http://localhost:3101';
export const API_URL = 'http://localhost:3100';
