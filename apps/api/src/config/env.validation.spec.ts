import 'reflect-metadata';
import { validateEnv } from './env.validation.js';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('applies defaults for PORT and JWT_EXPIRES_IN', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_EXPIRES_IN).toBe(900);
    expect(env.JWT_SECRET).toBe(base.JWT_SECRET);
  });

  it('applies defaults for logging and throttling', () => {
    const env = validateEnv(base);
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.THROTTLE_TTL_SECONDS).toBe(60);
    expect(env.THROTTLE_LIMIT).toBe(5);
    expect(env.THROTTLE_IP_LIMIT).toBe(30);
  });

  describe('LOG_LEVEL and throttling', () => {
    it.each(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])(
      'accepts LOG_LEVEL %s',
      (value) => {
        expect(validateEnv({ ...base, LOG_LEVEL: value }).LOG_LEVEL).toBe(
          value,
        );
      },
    );

    it('rejects a bad LOG_LEVEL', () => {
      expect(() => validateEnv({ ...base, LOG_LEVEL: 'loud' })).toThrow(
        /LOG_LEVEL/,
      );
    });

    it.each([
      ['THROTTLE_TTL_SECONDS', '3600', 3600],
      ['THROTTLE_LIMIT', '10000', 10000],
      ['THROTTLE_IP_LIMIT', '1', 1],
    ])('accepts %s=%s', (key, value, expected) => {
      expect(
        validateEnv({ ...base, [key]: value })[key as 'THROTTLE_LIMIT'],
      ).toBe(expected);
    });

    it.each([
      ['THROTTLE_TTL_SECONDS', ['0', '3601', '1.5', 'abc']],
      ['THROTTLE_LIMIT', ['0', '10001', '1.5', 'abc']],
      ['THROTTLE_IP_LIMIT', ['0', '10001', '1.5', 'abc']],
    ])('rejects bad %s', (key, values) => {
      for (const value of values) {
        expect(() => validateEnv({ ...base, [key]: value })).toThrow(
          new RegExp(key),
        );
      }
    });
  });

  describe('TRUST_PROXY', () => {
    it('defaults to 0', () => {
      expect(validateEnv(base).TRUST_PROXY).toBe(0);
    });

    it.each([
      ['0', 0],
      ['1', 1],
      ['10', 10],
    ])('accepts %s as a number', (value, expected) => {
      expect(validateEnv({ ...base, TRUST_PROXY: value }).TRUST_PROXY).toBe(
        expected,
      );
    });

    it.each(['-1', '11', '1.5', 'abc', 'true'])('rejects %s', (value) => {
      expect(() => validateEnv({ ...base, TRUST_PROXY: value })).toThrow(
        /TRUST_PROXY/,
      );
    });
  });

  describe('JWT_SECRET', () => {
    it('throws when missing', () => {
      const rest: Record<string, unknown> = { ...base };
      delete rest.JWT_SECRET;
      expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
    });

    it('throws when 31 characters', () => {
      expect(() =>
        validateEnv({ ...base, JWT_SECRET: 'a'.repeat(31) }),
      ).toThrow(/JWT_SECRET/);
    });

    it('accepts 32 characters', () => {
      expect(() =>
        validateEnv({ ...base, JWT_SECRET: 'a'.repeat(32) }),
      ).not.toThrow();
    });
  });

  describe('JWT_EXPIRES_IN', () => {
    it.each([
      ['60', 60],
      ['86400', 86400],
      ['900', 900],
    ])('accepts %s', (value, expected) => {
      expect(
        validateEnv({ ...base, JWT_EXPIRES_IN: value }).JWT_EXPIRES_IN,
      ).toBe(expected);
    });

    it.each(['59', '86401', 'abc', '1.5', '0'])('rejects %s', (value) => {
      expect(() => validateEnv({ ...base, JWT_EXPIRES_IN: value })).toThrow(
        /JWT_EXPIRES_IN/,
      );
    });
  });

  it('still rejects an invalid DATABASE_URL', () => {
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('still rejects an invalid PORT', () => {
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });
});

const validate = (extra: Record<string, unknown> = {}) =>
  validateEnv({ ...base, ...extra });

describe('validateEnv (MongoDB telemetry settings)', () => {
  it('is valid without Mongo variables and applies defaults', () => {
    const env = validate();
    expect(env.MONGODB_URI).toBeUndefined();
    expect(env.MONGODB_DB).toBeUndefined();
    expect(env.MONGODB_MAX_POOL_SIZE).toBe(10);
    expect(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS).toBe(2000);
    expect(env.TELEMETRY_RAW_RETENTION_DAYS).toBe(30);
  });

  it('treats empty MONGODB_URI and MONGODB_DB as unset', () => {
    const env = validate({ MONGODB_URI: '', MONGODB_DB: '' });
    expect(env.MONGODB_URI).toBeUndefined();
    expect(env.MONGODB_DB).toBeUndefined();
  });

  it('requires MONGODB_DB when MONGODB_URI is set', () => {
    expect(() =>
      validate({ MONGODB_URI: 'mongodb://127.0.0.1:27017' }),
    ).toThrow(/MONGODB_DB/);
    expect(() =>
      validate({ MONGODB_URI: 'mongodb://127.0.0.1:27017', MONGODB_DB: '' }),
    ).toThrow(/MONGODB_DB/);
  });

  it('rejects a non-mongodb URI', () => {
    expect(() =>
      validate({ MONGODB_URI: 'postgres://x/y', MONGODB_DB: 'telemetry' }),
    ).toThrow(/property MONGODB_URI has failed/);
  });

  it('accepts mongodb and mongodb+srv URIs', () => {
    expect(
      validate({ MONGODB_URI: 'mongodb://h:27017', MONGODB_DB: 'telemetry' })
        .MONGODB_URI,
    ).toBe('mongodb://h:27017');
    expect(
      validate({
        MONGODB_URI: 'mongodb+srv://u:p@cluster.example.net/?retryWrites=true',
        MONGODB_DB: 'telemetry',
      }).MONGODB_URI,
    ).toMatch(/^mongodb\+srv:/);
  });

  it.each(['a.b', 'a/b', 'a b', 'a'.repeat(55)])(
    'rejects MONGODB_DB %j',
    (name) => {
      expect(() =>
        validate({ MONGODB_URI: 'mongodb://h:27017', MONGODB_DB: name }),
      ).toThrow(/MONGODB_DB/);
    },
  );

  it('accepts a 54 character MONGODB_DB with _ and -', () => {
    const name = `a_-${'b'.repeat(51)}`;
    expect(
      validate({ MONGODB_URI: 'mongodb://h:27017', MONGODB_DB: name })
        .MONGODB_DB,
    ).toBe(name);
  });

  it.each([
    ['MONGODB_MAX_POOL_SIZE', 0],
    ['MONGODB_MAX_POOL_SIZE', 101],
    ['MONGODB_SERVER_SELECTION_TIMEOUT_MS', 499],
    ['MONGODB_SERVER_SELECTION_TIMEOUT_MS', 30001],
    ['TELEMETRY_RAW_RETENTION_DAYS', 0],
    ['TELEMETRY_RAW_RETENTION_DAYS', 3651],
  ])('rejects %s=%d', (key, value) => {
    expect(() => validate({ [key]: value })).toThrow(new RegExp(key));
  });

  it('converts numeric strings', () => {
    const env = validate({
      MONGODB_MAX_POOL_SIZE: '25',
      MONGODB_SERVER_SELECTION_TIMEOUT_MS: '1500',
      TELEMETRY_RAW_RETENTION_DAYS: '7',
    });
    expect(env.MONGODB_MAX_POOL_SIZE).toBe(25);
    expect(env.MONGODB_SERVER_SELECTION_TIMEOUT_MS).toBe(1500);
    expect(env.TELEMETRY_RAW_RETENTION_DAYS).toBe(7);
  });
});
