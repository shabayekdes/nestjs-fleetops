import { describe, expect, it } from 'vitest';
import { startEarly } from './start-early';

describe('startEarly', () => {
  it('resolves with the value', async () => {
    await expect(startEarly(Promise.resolve(1))).resolves.toBe(1);
  });

  it('still rejects when awaited later', async () => {
    const early = startEarly(Promise.reject(new Error('boom')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(early).rejects.toThrow('boom');
  });
});
