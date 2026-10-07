import { describe, expect, it } from 'vitest';
import { flashMessage, withFlash } from './flash';

describe('flashMessage', () => {
  it('returns the message for a known key', () => {
    expect(flashMessage('vehicle-created')).toBe('Vehicle created.');
    expect(flashMessage('vehicle-deleted')).toBe('Vehicle deleted.');
    expect(flashMessage('user-created')).toBe('User created.');
    expect(flashMessage('user-updated')).toBe('User updated.');
    expect(flashMessage('user-deleted')).toBe('User deleted.');
    expect(flashMessage('maintenance-created')).toBe(
      'Maintenance record added.',
    );
    expect(flashMessage('maintenance-updated')).toBe(
      'Maintenance record updated.',
    );
    expect(flashMessage('maintenance-deleted')).toBe(
      'Maintenance record deleted.',
    );
    expect(flashMessage('fuel-log-created')).toBe('Fuel log added.');
    expect(flashMessage('fuel-log-updated')).toBe('Fuel log updated.');
    expect(flashMessage('fuel-log-deleted')).toBe('Fuel log deleted.');
    expect(flashMessage('password-changed')).toBe('Password changed.');
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
