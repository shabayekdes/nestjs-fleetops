import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// jsdom lacks these browser APIs, which Radix UI components call.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
}

// Every server env var is required, so tests that call getServerEnv() get valid
// defaults. Override with vi.stubEnv when needed.
beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.test');
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-0123456789abcdef');
});

afterEach(() => {
  cleanup();
});
