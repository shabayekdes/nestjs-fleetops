import { describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('./session-api', () => ({ sessionApiRequest: request }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

import { getCurrentUser } from './current-user';

describe('getCurrentUser', () => {
  it('returns the /auth/me body', async () => {
    const me = { id: '1', firstName: 'A', lastName: 'B', role: 'ADMIN' };
    request.mockResolvedValue(me);
    await expect(getCurrentUser()).resolves.toBe(me);
    expect(request).toHaveBeenCalledWith('/auth/me');
  });

  it('propagates the session-expired redirect on 401', async () => {
    request.mockRejectedValue(new Error('REDIRECT:/session-expired'));
    await expect(getCurrentUser()).rejects.toThrow('REDIRECT');
  });
});
