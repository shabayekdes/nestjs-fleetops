import { uniqueConstraintHints } from './prisma-errors.js';

const adapter = (constraint: unknown) => ({
  driverAdapterError: { cause: { constraint } },
});

describe('uniqueConstraintHints', () => {
  it('returns [] for undefined or empty meta', () => {
    expect(uniqueConstraintHints(undefined)).toEqual([]);
    expect(uniqueConstraintHints({})).toEqual([]);
  });

  it('reads a string target', () => {
    expect(uniqueConstraintHints({ target: 'users_email_key' })).toEqual([
      'users_email_key',
    ]);
  });

  it('reads an array target and ignores non-strings', () => {
    expect(
      uniqueConstraintHints({ target: ['organizationId', 3, 'vin'] }),
    ).toEqual(['organizationId', 'vin']);
  });

  it('reads the adapter constraint index', () => {
    expect(
      uniqueConstraintHints(
        adapter({ index: 'vehicle_assignments_active_key' }),
      ),
    ).toEqual(['vehicle_assignments_active_key']);
  });

  it('reads the adapter constraint fields', () => {
    expect(
      uniqueConstraintHints(adapter({ fields: ['organization_id', 'vin'] })),
    ).toEqual(['organization_id', 'vin']);
  });

  it('combines target, index and fields', () => {
    expect(
      uniqueConstraintHints({
        target: 't',
        driverAdapterError: {
          cause: { constraint: { index: 'i', fields: ['f'] } },
        },
      }),
    ).toEqual(['t', 'i', 'f']);
  });

  it.each<[string, Record<string, unknown>]>([
    ['driverAdapterError is a string', { driverAdapterError: 'x' }],
    ['driverAdapterError is null', { driverAdapterError: null }],
    ['cause is missing', { driverAdapterError: {} }],
    ['cause is a string', { driverAdapterError: { cause: 'x' } }],
    ['constraint is a string', adapter('x')],
    ['constraint is null', adapter(null)],
    ['index is a number', adapter({ index: 5 })],
    ['target is a number', { target: 5 }],
  ])('returns [] when %s', (_name, meta) => {
    expect(uniqueConstraintHints(meta)).toEqual([]);
  });
});
