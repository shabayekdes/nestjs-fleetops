import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertServerEnv } from './assert-server-env';

describe('assertServerEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs and exits with code 1 when the env is invalid', () => {
    vi.stubEnv('API_BASE_URL', 'not-a-url');
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    assertServerEnv();

    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Invalid environment configuration'),
    );
  });

  it('does nothing when the env is valid', () => {
    vi.stubEnv('API_BASE_URL', 'http://localhost:3000');
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(32));
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    assertServerEnv();

    expect(exit).not.toHaveBeenCalled();
  });
});
