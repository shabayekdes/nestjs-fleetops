import { describe, expect, it } from 'vitest';
import { changedDriverFields, driverSchema } from './driver-schema';

const UID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const good = {
  firstName: ' Ada ',
  lastName: ' Lovelace ',
  licenseNumber: ' ab-123 ',
  licenseExpiresOn: '2030-05-20',
};

describe('driverSchema', () => {
  it('trims names and trims and uppercases the license number', () => {
    const result = driverSchema.parse(good);
    expect(result.firstName).toBe('Ada');
    expect(result.lastName).toBe('Lovelace');
    expect(result.licenseNumber).toBe('AB-123');
  });

  it('does not check the license number pattern', () => {
    expect(
      driverSchema.safeParse({ ...good, licenseNumber: '-bad-' }).success,
    ).toBe(true);
  });

  it('requires names and a license number, with the right messages', () => {
    const result = driverSchema.safeParse({
      ...good,
      firstName: ' ',
      lastName: '',
      licenseNumber: '  ',
    });
    expect(result.success).toBe(false);
    const errors = result.error?.flatten().fieldErrors;
    expect(errors?.firstName).toEqual(['Enter a first name']);
    expect(errors?.lastName).toEqual(['Enter a last name']);
    expect(errors?.licenseNumber).toEqual(['Enter a license number']);
  });

  it('limits lengths', () => {
    const result = driverSchema.safeParse({
      ...good,
      firstName: 'a'.repeat(101),
      licenseNumber: 'A'.repeat(31),
    });
    expect(result.error?.flatten().fieldErrors.firstName).toBeDefined();
    expect(result.error?.flatten().fieldErrors.licenseNumber).toBeDefined();
  });

  it('rejects an impossible date and a wrong format', () => {
    for (const licenseExpiresOn of ['2024-02-30', '2024-2-3', '', 'soon']) {
      const result = driverSchema.safeParse({ ...good, licenseExpiresOn });
      expect(result.error?.flatten().fieldErrors.licenseExpiresOn).toEqual([
        'Enter a valid date',
      ]);
    }
  });

  it('accepts a past date', () => {
    expect(
      driverSchema.safeParse({ ...good, licenseExpiresOn: '2001-01-01' })
        .success,
    ).toBe(true);
  });

  it('turns an empty userId into null, keeps a uuid, leaves absent as undefined', () => {
    expect(driverSchema.parse({ ...good, userId: '' }).userId).toBeNull();
    expect(driverSchema.parse({ ...good, userId: UID }).userId).toBe(UID);
    expect(driverSchema.parse(good).userId).toBeUndefined();
  });

  it('rejects a userId that is not a uuid', () => {
    const result = driverSchema.safeParse({ ...good, userId: 'nope' });
    expect(result.error?.flatten().fieldErrors.userId).toEqual([
      'Choose a user from the list',
    ]);
  });
});

describe('changedDriverFields', () => {
  const original = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    licenseNumber: 'AB-123',
    licenseExpiresOn: '2030-05-20',
    userId: UID as string | null,
  };

  it('returns nothing when nothing changed', () => {
    expect(changedDriverFields(original, { ...original })).toEqual({});
  });

  it('sends only the changed fields', () => {
    expect(
      changedDriverFields(original, {
        ...original,
        lastName: 'King',
        licenseExpiresOn: '2031-01-01',
      }),
    ).toEqual({ lastName: 'King', licenseExpiresOn: '2031-01-01' });
  });

  it('does not count a license that differs only in case as a change', () => {
    const next = driverSchema.parse({
      firstName: 'Ada',
      lastName: 'Lovelace',
      licenseNumber: 'ab-123',
      licenseExpiresOn: '2030-05-20',
      userId: UID,
    });
    expect(changedDriverFields(original, next)).toEqual({});
  });

  it('sends userId null to unlink', () => {
    expect(
      changedDriverFields(original, { ...original, userId: null }),
    ).toEqual({
      userId: null,
    });
  });

  it('leaves userId out when the form had no such field', () => {
    expect(
      changedDriverFields(original, { ...original, userId: undefined }),
    ).toEqual({});
  });

  it('sends a newly linked user', () => {
    expect(
      changedDriverFields(
        { ...original, userId: null },
        { ...original, userId: UID },
      ),
    ).toEqual({ userId: UID });
  });
});
