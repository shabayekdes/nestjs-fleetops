import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { errorBody } from './utils/error-body.js';

type Body = Record<string, unknown>;
type Item = { id: string; name: string; slug: string; active: boolean };
type ListBody = {
  data: Item[];
  meta: { page: number; limit: number; total: number };
};

const MAKES = '/api/v1/master-data/vehicle-makes';
const TYPES = '/api/v1/master-data/vehicle-types';
const RESPONSE_KEYS = ['active', 'id', 'name', 'slug'];
const BAD_UUID = 'Validation failed (uuid v 7 is expected)';
// Valid UUIDv7 that no make has.
const UNKNOWN_MAKE_ID = '01890a5d-ac96-774b-bcce-b302099a8057';

// Makes are GLOBAL: lists also contain rows from the seed and other test
// files. Every row here carries `suffix`, and list assertions search by it.
describe('Vehicle master data (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = randomUUID().slice(0, 8);
  const password = `Md-${suffix}-pass!`;
  const tokens: Record<'ADMIN' | 'MANAGER' | 'DRIVER', string> = {
    ADMIN: '',
    MANAGER: '',
    DRIVER: '',
  };
  let orgId = '';
  const makeIds: string[] = [];
  const typeIds: string[] = [];

  const makeName = (label: string): string => `E2E ${label} ${suffix}`;
  const slugOf = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const createMake = async (label: string, active = true): Promise<string> => {
    const name = makeName(label);
    const make = await prisma.vehicleMake.create({
      data: { name, slug: slugOf(name), active },
      select: { id: true },
    });
    makeIds.push(make.id);
    return make.id;
  };

  const createModel = (makeId: string, name: string, active = true) =>
    prisma.vehicleModel.create({
      data: { makeId, name, slug: slugOf(name), active },
    });

  const createType = async (label: string, active = true): Promise<string> => {
    const name = makeName(label);
    const type = await prisma.vehicleType.create({
      data: { name, slug: slugOf(name), active },
      select: { id: true },
    });
    typeIds.push(type.id);
    return type.id;
  };

  const getTypes = (
    path: string,
    role: keyof typeof tokens | null = 'ADMIN',
  ) => {
    const req = request(app.getHttpServer()).get(`${TYPES}${path}`);
    return role === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[role]}`);
  };

  const get = (path: string, role: keyof typeof tokens | null = 'ADMIN') => {
    const req = request(app.getHttpServer()).get(`${MAKES}${path}`);
    return role === null
      ? req
      : req.set('Authorization', `Bearer ${tokens[role]}`);
  };

  const names = (body: unknown): string[] =>
    (body as ListBody).data.map((d) => d.name);

  // Make A: three active models (inserted out of order) and a retired one.
  // Make B: a model with the same name as one of A's.
  // Make "Empty": no models. Make "Retired": retired, with one model.
  let makeA = '';
  let makeB = '';
  let makeEmpty = '';
  let makeRetired = '';
  let typeZulu = '';
  let typeAlpha = '';
  let typeRetired = '';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const slug = `md-${suffix}`;
    const org = await prisma.organization.create({
      data: { name: `Md ${suffix}`, slug },
    });
    orgId = org.id;
    const passwordHash = await hash(password);
    for (const role of ['ADMIN', 'MANAGER', 'DRIVER'] as const) {
      const email = `${role.toLowerCase()}-${suffix}@example.test`;
      await prisma.user.create({
        data: {
          organizationId: orgId,
          email,
          firstName: 'Test',
          lastName: role,
          passwordHash,
          role,
        },
      });
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ organizationSlug: slug, email, password })
        .expect(200);
      tokens[role] = (res.body as Body).accessToken as string;
    }

    // Created out of alphabetical order on purpose.
    makeA = await createMake('Zeta');
    makeB = await createMake('Alpha');
    makeEmpty = await createMake('Mid');
    makeRetired = await createMake('Retired', false);
    for (const name of ['Zulu', 'Alpha', 'Mike']) {
      await createModel(makeA, name);
    }
    await createModel(makeA, 'Oscar', false);
    await createModel(makeB, 'Alpha');
    await createModel(makeRetired, 'Legacy');

    // Vehicle types, also created out of alphabetical order.
    typeZulu = await createType('Type Zulu');
    typeAlpha = await createType('Type Alpha');
    typeRetired = await createType('Type Retired', false);
  });

  afterAll(async () => {
    if (!app) return;
    try {
      if (makeIds.length > 0) {
        await prisma.vehicleModel.deleteMany({
          where: { makeId: { in: makeIds } },
        });
        await prisma.vehicleMake.deleteMany({ where: { id: { in: makeIds } } });
      }
      if (typeIds.length > 0) {
        await prisma.vehicleType.deleteMany({ where: { id: { in: typeIds } } });
      }
      if (orgId) {
        await prisma.user.deleteMany({ where: { organizationId: orgId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
      }
    } finally {
      await app.close();
    }
  });

  describe('authentication and roles', () => {
    it('GET /master-data/vehicle-makes without a token returns 401', async () => {
      const res = await get('', null).expect(401);
      expect(res.body).toEqual(errorBody(401, 'Unauthorized'));
    });

    it('GET /master-data/vehicle-makes/:makeId/models without a token returns 401', async () => {
      await get(`/${makeA}/models`, null).expect(401);
    });

    it.each(['ADMIN', 'MANAGER', 'DRIVER'] as const)(
      'allows %s to read makes and models',
      async (role) => {
        await get(`?search=${suffix}`, role).expect(200);
        await get(`/${makeA}/models`, role).expect(200);
      },
    );
  });

  describe('GET /master-data/vehicle-makes', () => {
    it('returns active makes and hides retired ones', async () => {
      const res = await get(`?search=${suffix}`).expect(200);
      expect(names(res.body)).not.toContain(makeName('Retired'));
      expect((res.body as ListBody).meta.total).toBe(3);
    });

    it('returns retired makes with includeInactive=true', async () => {
      const res = await get(`?search=${suffix}&includeInactive=true`).expect(
        200,
      );
      const retired = (res.body as ListBody).data.find(
        (d) => d.id === makeRetired,
      );
      expect(retired?.active).toBe(false);
    });

    it('orders makes alphabetically by name', async () => {
      const res = await get(`?search=${suffix}`).expect(200);
      expect(names(res.body)).toEqual([
        makeName('Alpha'),
        makeName('Mid'),
        makeName('Zeta'),
      ]);
    });

    it('search is case-insensitive', async () => {
      const res = await get(`?search=${suffix.toUpperCase()}`).expect(200);
      expect((res.body as ListBody).meta.total).toBe(3);
    });

    it('search matches anywhere in the name', async () => {
      const res = await get(
        `?search=${encodeURIComponent(`zeta ${suffix}`)}`,
      ).expect(200);
      expect(names(res.body)).toEqual([makeName('Zeta')]);
    });

    it('search with no match returns an empty data array (200, not 404)', async () => {
      const res = await get(`?search=nomatch-${suffix}`).expect(200);
      expect(res.body).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    });

    it.each(['%', '_'])(
      'treats %j in search as a literal character',
      async (wildcard) => {
        const res = await get(
          `?search=${encodeURIComponent(`${suffix}${wildcard}`)}`,
        ).expect(200);
        expect((res.body as ListBody).meta.total).toBe(0);
      },
    );

    it('paginates with meta', async () => {
      const res = await get(`?search=${suffix}&page=2&limit=2`).expect(200);
      expect(names(res.body)).toEqual([makeName('Zeta')]);
      expect((res.body as ListBody).meta).toEqual({
        page: 2,
        limit: 2,
        total: 3,
      });
    });

    it('returns exactly the documented response keys', async () => {
      const res = await get(`?search=${suffix}`).expect(200);
      expect(Object.keys(res.body as Body).sort()).toEqual(['data', 'meta']);
      for (const item of (res.body as ListBody).data) {
        expect(Object.keys(item).sort()).toEqual(RESPONSE_KEYS);
      }
    });

    it.each(['page=0', 'limit=101', 'search=', 'includeInactive=yes'])(
      'rejects invalid query %s with 400 and details',
      async (qs) => {
        const res = await get(`?${qs}`).expect(400);
        expect(res.body).toMatchObject(errorBody(400, 'Validation failed'));
        expect((res.body as Body).details).toBeDefined();
      },
    );

    it('rejects unknown query parameters with 400', async () => {
      const res = await get('?organizationId=x').expect(400);
      expect(res.body).toMatchObject(errorBody(400, 'Validation failed'));
    });
  });

  describe('GET /master-data/vehicle-makes/:slug', () => {
    it('returns one make by slug, case-insensitively', async () => {
      const slug = slugOf(makeName('Zeta'));
      const res = await get(`/${slug.toUpperCase()}`).expect(200);
      expect(res.body).toEqual({
        id: makeA,
        name: makeName('Zeta'),
        slug,
        active: true,
      });
    });

    it('returns a retired make with active=false', async () => {
      const res = await get(`/${slugOf(makeName('Retired'))}`).expect(200);
      expect((res.body as Item).active).toBe(false);
    });

    it('returns 404 for an unknown slug', async () => {
      const res = await get(`/nomatch-${suffix}`).expect(404);
      expect(res.body).toEqual(errorBody(404, 'Vehicle make not found'));
    });
  });

  describe('GET /master-data/vehicle-makes/:makeId/models', () => {
    it('returns only the models belonging to the requested make', async () => {
      const res = await get(`/${makeB}/models`).expect(200);
      expect(names(res.body)).toEqual(['Alpha']);
    });

    it('returns 404 for an unknown (valid UUIDv7) make id', async () => {
      const res = await get(`/${UNKNOWN_MAKE_ID}/models`).expect(404);
      expect(res.body).toEqual(errorBody(404, 'Vehicle make not found'));
    });

    it('returns 400 for a malformed make id', async () => {
      const res = await get('/not-a-uuid/models').expect(400);
      expect((res.body as Body).message).toBe(BAD_UUID);
    });

    it('returns no models for a retired make by default', async () => {
      const res = await get(`/${makeRetired}/models`).expect(200);
      expect((res.body as ListBody).data).toEqual([]);
    });

    it('returns the models of a retired make with includeInactive=true', async () => {
      const res = await get(
        `/${makeRetired}/models?includeInactive=true`,
      ).expect(200);
      expect(names(res.body)).toEqual(['Legacy']);
    });

    it('excludes retired models', async () => {
      const res = await get(`/${makeA}/models`).expect(200);
      expect(names(res.body)).not.toContain('Oscar');
    });

    it('orders models alphabetically by name', async () => {
      const res = await get(`/${makeA}/models`).expect(200);
      expect(names(res.body)).toEqual(['Alpha', 'Mike', 'Zulu']);
    });

    it('includes retired models with includeInactive=true', async () => {
      const res = await get(`/${makeA}/models?includeInactive=true`).expect(
        200,
      );
      expect(names(res.body)).toEqual(['Alpha', 'Mike', 'Oscar', 'Zulu']);
    });

    it('search is case-insensitive and limited to the make', async () => {
      const res = await get(`/${makeA}/models?search=ALPHA`).expect(200);
      const items = (res.body as ListBody).data;
      expect(items).toHaveLength(1);
      expect(Object.keys(items[0]).sort()).toEqual(RESPONSE_KEYS);
      expect(items[0].name).toBe('Alpha');
    });

    it('returns an empty list for an existing make without models', async () => {
      const res = await get(`/${makeEmpty}/models`).expect(200);
      expect(res.body).toEqual({
        data: [],
        meta: { page: 1, limit: 20, total: 0 },
      });
    });
  });

  describe('GET /master-data/vehicle-types', () => {
    it('returns 401 without a token', async () => {
      const res = await getTypes('', null).expect(401);
      expect(res.body).toEqual(errorBody(401, 'Unauthorized'));
    });

    it.each(['ADMIN', 'MANAGER', 'DRIVER'] as const)(
      'allows %s to read vehicle types',
      async (role) => {
        await getTypes(`?search=${suffix}`, role).expect(200);
      },
    );

    it('returns active types alphabetically and hides retired ones', async () => {
      const res = await getTypes(`?search=${suffix}`).expect(200);
      expect(names(res.body)).toEqual([
        makeName('Type Alpha'),
        makeName('Type Zulu'),
      ]);
      expect((res.body as ListBody).meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
      });
    });

    it('returns retired types with includeInactive=true', async () => {
      const res = await getTypes(
        `?search=${suffix}&includeInactive=true`,
      ).expect(200);
      const retired = (res.body as ListBody).data.find(
        (d) => d.id === typeRetired,
      );
      expect(retired?.active).toBe(false);
    });

    it('search is case-insensitive and treats % literally', async () => {
      const upper = await getTypes(
        `?search=${encodeURIComponent(`TYPE ZULU ${suffix.toUpperCase()}`)}`,
      ).expect(200);
      expect((upper.body as ListBody).data.map((d) => d.id)).toEqual([
        typeZulu,
      ]);
      const wildcard = await getTypes(
        `?search=${encodeURIComponent(`${suffix}%`)}`,
      ).expect(200);
      expect((wildcard.body as ListBody).meta.total).toBe(0);
    });

    it('returns exactly the documented response keys', async () => {
      const res = await getTypes(`?search=${suffix}`).expect(200);
      expect(Object.keys(res.body as Body).sort()).toEqual(['data', 'meta']);
      for (const item of (res.body as ListBody).data) {
        expect(Object.keys(item).sort()).toEqual(RESPONSE_KEYS);
      }
    });

    it.each(['page=0', 'limit=101', 'search=', 'includeInactive=yes'])(
      'rejects invalid query %s with 400',
      async (qs) => {
        const res = await getTypes(`?${qs}`).expect(400);
        expect(res.body).toMatchObject(errorBody(400, 'Validation failed'));
      },
    );

    it('rejects unknown query parameters with 400', async () => {
      await getTypes('?organizationId=x').expect(400);
    });
  });

  describe('GET /master-data/vehicle-types/:slug', () => {
    it('returns one type by slug, case-insensitively', async () => {
      const slug = slugOf(makeName('Type Alpha'));
      const res = await getTypes(`/${slug.toUpperCase()}`).expect(200);
      expect(res.body).toEqual({
        id: typeAlpha,
        name: makeName('Type Alpha'),
        slug,
        active: true,
      });
    });

    it('returns a retired type with active=false', async () => {
      const res = await getTypes(`/${slugOf(makeName('Type Retired'))}`).expect(
        200,
      );
      expect((res.body as Item).active).toBe(false);
    });

    it('returns 404 for an unknown slug', async () => {
      const res = await getTypes(`/nomatch-${suffix}`).expect(404);
      expect(res.body).toEqual(errorBody(404, 'Vehicle type not found'));
    });
  });

  describe('relationships and constraints', () => {
    it('rejects a model whose make does not exist', async () => {
      await expect(
        createModel(UNKNOWN_MAKE_ID, `Orphan ${suffix}`),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('cannot delete a make that still has models', async () => {
      await expect(
        prisma.vehicleMake.delete({ where: { id: makeA } }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('enforces the make uniqueness rules', async () => {
      const name = makeName('Zeta');
      // Same slug, different-case name: the lowercase slug collides.
      await expect(
        prisma.vehicleMake.create({
          data: { name: name.toUpperCase(), slug: slugOf(name) },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      // Same name, different slug.
      await expect(
        prisma.vehicleMake.create({
          data: { name, slug: `${slugOf(name)}-2` },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('enforces the vehicle type uniqueness rules', async () => {
      const name = makeName('Type Alpha');
      await expect(
        prisma.vehicleType.create({
          data: { name: name.toUpperCase(), slug: slugOf(name) },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.vehicleType.create({
          data: { name, slug: `${slugOf(name)}-2` },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('enforces the model uniqueness rules per make', async () => {
      // Same (make, slug) and same (make, name) collide...
      await expect(
        prisma.vehicleModel.create({
          data: { makeId: makeA, name: 'Alpha 2', slug: 'alpha' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.vehicleModel.create({
          data: { makeId: makeA, name: 'Alpha', slug: 'alpha-2' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      // ...but the same name under another make is allowed (made in setup).
      const alphas = await prisma.vehicleModel.count({
        where: { name: 'Alpha', makeId: { in: [makeA, makeB] } },
      });
      expect(alphas).toBe(2);
    });
  });
});
