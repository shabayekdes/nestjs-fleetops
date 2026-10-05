import {
  accountTracker,
  buildThrottlerOptions,
  ipTracker,
} from './throttling.js';

describe('throttling', () => {
  it('keys authenticated requests by user', () => {
    expect(accountTracker({ ip: '1.1.1.1', user: { userId: 'u1' } })).toBe(
      'user:u1',
    );
  });

  it('normalizes login identity like LoginDto', () => {
    const req = {
      ip: '1.1.1.1',
      body: { organizationSlug: ' ACME ', email: ' A@B.com ' },
    };
    expect(accountTracker(req)).toBe('login:1.1.1.1:acme:a@b.com');
  });

  it('tolerates missing or non-string body fields', () => {
    expect(accountTracker({ ip: '1.1.1.1' })).toBe('login:1.1.1.1::');
    expect(
      accountTracker({
        ip: '1.1.1.1',
        body: { email: 1, organizationSlug: {} },
      }),
    ).toBe('login:1.1.1.1::');
  });

  it('keys by ip', () => {
    expect(ipTracker({ ip: '2.2.2.2' })).toBe('ip:2.2.2.2');
  });

  it('builds options with ttl in milliseconds', () => {
    const options = buildThrottlerOptions({
      ttlSeconds: 60,
      limit: 3,
      ipLimit: 6,
    });
    expect(options).toMatchObject({
      throttlers: [
        { name: 'default', ttl: 60000, limit: 3 },
        { name: 'ip', ttl: 60000, limit: 6 },
      ],
    });
  });
});
