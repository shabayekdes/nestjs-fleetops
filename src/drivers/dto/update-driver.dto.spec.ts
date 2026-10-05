import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateDriverDto } from './update-driver.dto.js';

const UUID7 = '01970000-0000-7000-8000-000000000001';
const UUID4 = '3b241101-e2bb-4255-8caf-4136c566a962';

const run = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateDriverDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, errors, fields: errors.map((e) => e.property) };
};

describe('UpdateDriverDto', () => {
  it('accepts an empty body', async () => {
    expect((await run({})).errors).toHaveLength(0);
  });

  it('accepts a full valid payload and normalizes', async () => {
    const { dto, errors } = await run({
      firstName: ' A ',
      lastName: ' B ',
      licenseNumber: ' xy-1 ',
      licenseExpiresOn: '2024-02-29',
      userId: UUID7,
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      firstName: 'A',
      lastName: 'B',
      licenseNumber: 'XY-1',
      licenseExpiresOn: '2024-02-29',
      userId: UUID7,
    });
  });

  it.each(['firstName', 'lastName', 'licenseNumber', 'licenseExpiresOn'])(
    'rejects explicit null for %s',
    async (field) => {
      expect((await run({ [field]: null })).fields).toContain(field);
    },
  );

  it('keeps userId null (unlink) and accepts it', async () => {
    const { dto, errors } = await run({ userId: null });
    expect(errors).toHaveLength(0);
    expect(dto.userId).toBeNull();
  });

  it.each(['nope', UUID4, '', 5])('rejects userId %j', async (value) => {
    expect((await run({ userId: value })).fields).toContain('userId');
  });

  it.each(['firstName', 'lastName'])(
    '%s: blank, 101 rejected, 100 ok',
    async (f) => {
      expect((await run({ [f]: '   ' })).fields).toContain(f);
      expect((await run({ [f]: '' })).fields).toContain(f);
      expect((await run({ [f]: 'a'.repeat(101) })).fields).toContain(f);
      expect((await run({ [f]: 'a'.repeat(100) })).errors).toHaveLength(0);
    },
  );

  it.each(['-A', 'A-', 'A_B', 'A'.repeat(31), ''])(
    'rejects licenseNumber %j',
    async (value) => {
      expect((await run({ licenseNumber: value })).fields).toContain(
        'licenseNumber',
      );
    },
  );

  it.each(['2027-02-30', '2027-2-1', '2027-02-01T00:00:00Z', 5])(
    'rejects licenseExpiresOn %j',
    async (value) => {
      expect((await run({ licenseExpiresOn: value })).fields).toContain(
        'licenseExpiresOn',
      );
    },
  );

  it.each(['organizationId', 'id', 'extra'])('rejects key %s', async (key) => {
    expect((await run({ [key]: 'x' })).fields).toContain(key);
  });
});
