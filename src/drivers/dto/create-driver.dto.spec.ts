import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDriverDto } from './create-driver.dto.js';
import { LICENSE_NUMBER_MESSAGE } from './driver-normalizers.js';

const UUID7 = '01970000-0000-7000-8000-000000000001';
const UUID4 = '3b241101-e2bb-4255-8caf-4136c566a962';

const valid = (): Record<string, unknown> => ({
  firstName: 'Sam',
  lastName: 'Driver',
  licenseNumber: 'DL-1001',
  licenseExpiresOn: '2027-01-01',
});

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateDriverDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('CreateDriverDto', () => {
  it('accepts a valid payload without userId', async () => {
    expect((await run(valid())).errors).toHaveLength(0);
  });

  it('reports exactly the required fields for an empty body', async () => {
    const { fields } = await run({});
    expect([...fields].sort()).toEqual([
      'firstName',
      'lastName',
      'licenseExpiresOn',
      'licenseNumber',
    ]);
  });

  it('trims names and trims+uppercases the license number', async () => {
    const { dto, errors } = await run({
      ...valid(),
      firstName: '  Sam ',
      lastName: ' Driver  ',
      licenseNumber: '  dl-1001 ',
    });
    expect(errors).toHaveLength(0);
    expect(dto.firstName).toBe('Sam');
    expect(dto.lastName).toBe('Driver');
    expect(dto.licenseNumber).toBe('DL-1001');
  });

  describe.each(['firstName', 'lastName'])('%s', (field) => {
    it.each(['', '   '])('rejects %j', async (value) => {
      expect((await run({ ...valid(), [field]: value })).fields).toContain(
        field,
      );
    });
    it('accepts 100 chars and rejects 101', async () => {
      expect(
        (await run({ ...valid(), [field]: 'a'.repeat(100) })).errors,
      ).toHaveLength(0);
      expect(
        (await run({ ...valid(), [field]: 'a'.repeat(101) })).fields,
      ).toContain(field);
    });
    it.each([5, null, true, {}])('rejects non-string %j', async (value) => {
      expect((await run({ ...valid(), [field]: value })).fields).toContain(
        field,
      );
    });
  });

  describe('licenseNumber', () => {
    it('accepts 30 chars and rejects 31', async () => {
      expect(
        (await run({ ...valid(), licenseNumber: 'A'.repeat(30) })).errors,
      ).toHaveLength(0);
      expect(
        (await run({ ...valid(), licenseNumber: 'A'.repeat(31) })).fields,
      ).toContain('licenseNumber');
    });

    it.each(['-AB1', 'AB1-', ' - ', 'AB_1', 'AB.1', 'AB/1', ''])(
      'rejects %j',
      async (value) => {
        const { errors } = await run({ ...valid(), licenseNumber: value });
        expect(errors.map((e) => e.property)).toContain('licenseNumber');
      },
    );

    it('uses the pattern message', async () => {
      const { errors } = await run({ ...valid(), licenseNumber: '-X' });
      expect(Object.values(errors[0].constraints ?? {})).toContain(
        LICENSE_NUMBER_MESSAGE,
      );
    });

    it('accepts inner spaces and hyphens', async () => {
      expect(
        (await run({ ...valid(), licenseNumber: 'ab 12-c' })).errors,
      ).toHaveLength(0);
    });

    it.each([5, null, true])('rejects non-string %j', async (value) => {
      expect(
        (await run({ ...valid(), licenseNumber: value })).fields,
      ).toContain('licenseNumber');
    });
  });

  describe('licenseExpiresOn', () => {
    it.each(['2027-02-01', '2024-02-29', '2000-01-01'])(
      'accepts %s',
      async (value) => {
        expect(
          (await run({ ...valid(), licenseExpiresOn: value })).errors,
        ).toHaveLength(0);
      },
    );

    it.each([
      '2027-02-30',
      '2027-2-1',
      '2027-02-01T00:00:00Z',
      '2025-02-29',
      '2027-13-01',
      '',
      'tomorrow',
      20270201,
      null,
      true,
    ])('rejects %j', async (value) => {
      expect(
        (await run({ ...valid(), licenseExpiresOn: value })).fields,
      ).toContain('licenseExpiresOn');
    });
  });

  describe('userId', () => {
    it('accepts a UUIDv7, null and omitted', async () => {
      expect((await run({ ...valid(), userId: UUID7 })).errors).toHaveLength(0);
      const withNull = await run({ ...valid(), userId: null });
      expect(withNull.errors).toHaveLength(0);
      expect(withNull.dto.userId).toBeNull();
    });

    it.each(['nope', UUID4, '', 5])('rejects %j', async (value) => {
      expect((await run({ ...valid(), userId: value })).fields).toContain(
        'userId',
      );
    });
  });

  it.each(['organizationId', 'id', 'createdAt', 'extra'])(
    'rejects unknown/server-owned key %s',
    async (key) => {
      expect((await run({ ...valid(), [key]: 'x' })).fields).toContain(key);
    },
  );
});
