import { describe, expect, it, vi } from 'vitest';

const deleteSession = vi.hoisted(() => vi.fn());
vi.mock('./session', () => ({ deleteSession }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { logout } from './actions';

describe('logout', () => {
  it('deletes the session and redirects to login', async () => {
    await expect(logout()).rejects.toThrow('REDIRECT:/login?reason=signed-out');
    expect(deleteSession).toHaveBeenCalledOnce();
  });
});
