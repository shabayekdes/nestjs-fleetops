import { describe, expect, it } from 'vitest';
import { flashMessage, withFlash } from './flash';

describe('flashMessage', () => {
  it('returns the message for a known key', () => {
    expect(flashMessage('vehicle-created')).toBe('Vehicle created.');
    expect(flashMessage('vehicle-deleted')).toBe('Vehicle deleted.');
  });

  it.each([
    'nope',
    '',
    '__proto__',
    'toString',
    undefined,
    ['vehicle-created'],
  ])('returns undefined for %j', (value) => {
    expect(flashMessage(value)).toBeUndefined();
  });
});

describe('withFlash', () => {
  it('adds the notice param', () => {
    expect(withFlash('/vehicles/abc', 'vehicle-updated')).toBe(
      '/vehicles/abc?notice=vehicle-updated',
    );
  });
});
