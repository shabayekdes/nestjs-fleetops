import { describe, expect, it } from 'vitest';
import {
  changedMaintenanceFields,
  maintenanceInputToValues,
  maintenanceRecordToInput,
  maintenanceSchema,
  toCreateBody,
  type MaintenanceInput,
} from './maintenance-schema';

const good = {
  type: 'OIL_CHANGE',
  performedOn: '2026-01-15',
  cost: '89.90',
  odometerKm: '',
  vendor: '',
  description: '',
  nextServiceDueOn: '',
};

function errors(overrides: Record<string, string>) {
  const result = maintenanceSchema.safeParse({ ...good, ...overrides });
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path[0], issue.message]),
  );
}

describe('maintenanceSchema', () => {
  it('accepts the minimum and turns empty optionals into null', () => {
    const result = maintenanceSchema.parse(good);
    expect(result).toEqual({
      type: 'OIL_CHANGE',
      performedOn: '2026-01-15',
      cost: '89.90',
      odometerKm: null,
      vendor: null,
      description: null,
      nextServiceDueOn: null,
    });
  });

  it('trims and converts the optional values', () => {
    const result = maintenanceSchema.parse({
      ...good,
      odometerKm: ' 120000 ',
      vendor: '  Quick Lube ',
      description: ' New filter ',
      nextServiceDueOn: ' 2026-07-15 ',
    });
    expect(result.odometerKm).toBe(120000);
    expect(result.vendor).toBe('Quick Lube');
    expect(result.description).toBe('New filter');
    expect(result.nextServiceDueOn).toBe('2026-07-15');
  });

  it('treats whitespace-only text as null', () => {
    const result = maintenanceSchema.parse({
      ...good,
      vendor: '   ',
      description: '  ',
    });
    expect(result.vendor).toBeNull();
    expect(result.description).toBeNull();
  });

  it.each(['', 'WASHING', 'oil_change'])('rejects type %j', (type) => {
    expect(errors({ type }).type).toBe('Choose a type');
  });

  it.each(['', '2026-02-30', '15/01/2026', '2026-1-5'])(
    'rejects performedOn %j',
    (performedOn) => {
      expect(errors({ performedOn }).performedOn).toBe('Enter a valid date');
    },
  );

  it.each(['', 'abc', '-5', '1.234', '.5', '12345678901', '1,5', '89.'])(
    'rejects cost %j',
    (cost) => {
      expect(errors({ cost }).cost).toBe('Enter an amount such as 89.90');
    },
  );

  it.each(['0', '89', '89.9', '0.05', '9999999999.99'])(
    'accepts cost %j',
    (cost) => {
      expect(errors({ cost }).cost).toBeUndefined();
    },
  );

  it.each(['-1', '1.5', 'abc', '12345678', '1e3'])(
    'rejects odometerKm %j',
    (odometerKm) => {
      expect(errors({ odometerKm }).odometerKm).toBeDefined();
    },
  );

  it('accepts the odometer limits', () => {
    expect(
      maintenanceSchema.parse({ ...good, odometerKm: '0' }).odometerKm,
    ).toBe(0);
    expect(
      maintenanceSchema.parse({ ...good, odometerKm: '9999999' }).odometerKm,
    ).toBe(9999999);
  });

  it('limits description to 500 and vendor to 100 characters', () => {
    expect(errors({ description: 'a'.repeat(501) }).description).toBe(
      'At most 500 characters',
    );
    expect(
      errors({ description: 'a'.repeat(500) }).description,
    ).toBeUndefined();
    expect(errors({ vendor: 'a'.repeat(101) }).vendor).toBe(
      'At most 100 characters',
    );
    expect(errors({ vendor: 'a'.repeat(100) }).vendor).toBeUndefined();
  });

  it('rejects an invalid nextServiceDueOn', () => {
    expect(errors({ nextServiceDueOn: '2026-13-01' }).nextServiceDueOn).toBe(
      'Enter a valid date',
    );
  });

  it('does not compare nextServiceDueOn with performedOn (the API does)', () => {
    expect(
      errors({ performedOn: '2026-01-15', nextServiceDueOn: '2026-01-01' }),
    ).toEqual({});
  });
});

describe('toCreateBody', () => {
  const base: MaintenanceInput = {
    type: 'TIRES',
    performedOn: '2026-01-15',
    cost: '10',
    odometerKm: null,
    vendor: null,
    description: null,
    nextServiceDueOn: null,
  };

  it('leaves out null optionals', () => {
    expect(toCreateBody(base)).toEqual({
      type: 'TIRES',
      performedOn: '2026-01-15',
      cost: '10',
    });
  });

  it('includes the optionals that have a value, odometer 0 too', () => {
    expect(
      toCreateBody({
        ...base,
        odometerKm: 0,
        vendor: 'V',
        description: 'D',
        nextServiceDueOn: '2026-07-01',
      }),
    ).toEqual({
      type: 'TIRES',
      performedOn: '2026-01-15',
      cost: '10',
      odometerKm: 0,
      vendor: 'V',
      description: 'D',
      nextServiceDueOn: '2026-07-01',
    });
  });
});

describe('changedMaintenanceFields', () => {
  const original: MaintenanceInput = {
    type: 'OIL_CHANGE',
    performedOn: '2026-01-15',
    cost: '89.90',
    odometerKm: 1000,
    vendor: 'V',
    description: 'D',
    nextServiceDueOn: '2026-07-01',
  };

  it('returns {} when nothing changed', () => {
    expect(changedMaintenanceFields(original, { ...original })).toEqual({});
  });

  it('treats 89.9 and 89.90 (and 089.90) as the same cost', () => {
    expect(
      changedMaintenanceFields(original, { ...original, cost: '89.9' }),
    ).toEqual({});
    expect(
      changedMaintenanceFields(original, { ...original, cost: '089.90' }),
    ).toEqual({});
  });

  it('sends a changed cost as typed', () => {
    expect(
      changedMaintenanceFields(original, { ...original, cost: '90' }),
    ).toEqual({ cost: '90' });
  });

  it('sends null for a cleared optional field', () => {
    expect(
      changedMaintenanceFields(original, {
        ...original,
        odometerKm: null,
        vendor: null,
        description: null,
        nextServiceDueOn: null,
      }),
    ).toEqual({
      odometerKm: null,
      vendor: null,
      description: null,
      nextServiceDueOn: null,
    });
  });

  it('sends only the changed fields', () => {
    expect(
      changedMaintenanceFields(original, {
        ...original,
        type: 'BRAKES',
        performedOn: '2026-01-16',
      }),
    ).toEqual({ type: 'BRAKES', performedOn: '2026-01-16' });
  });
});

describe('record conversion', () => {
  it('maps a record to input and to form values', () => {
    const input = maintenanceRecordToInput({
      id: 'x',
      vehicleId: 'v',
      type: 'REPAIR',
      description: null,
      vendor: 'V',
      performedOn: '2026-01-15',
      odometerKm: 0,
      cost: '5.00',
      nextServiceDueOn: null,
      createdAt: '',
      updatedAt: '',
    });
    expect(input).toEqual({
      type: 'REPAIR',
      performedOn: '2026-01-15',
      cost: '5.00',
      odometerKm: 0,
      vendor: 'V',
      description: null,
      nextServiceDueOn: null,
    });
    expect(maintenanceInputToValues(input)).toEqual({
      type: 'REPAIR',
      performedOn: '2026-01-15',
      cost: '5.00',
      odometerKm: '0',
      vendor: 'V',
      description: '',
      nextServiceDueOn: '',
    });
  });
});
