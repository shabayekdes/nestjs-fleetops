import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Every server env var is required, so tests that call getServerEnv() get valid
// defaults. Override with vi.stubEnv when needed.
beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-0123456789abcdef');
});

afterEach(() => {
  cleanup();
});
