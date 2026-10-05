import { describe, expect, it } from 'vitest';
import { loginUrl, safeReturnTo } from './return-to';

describe('safeReturnTo', () => {
  it.each(['/', '/vehicles?page=2', '/a#b'])('keeps %s', (value) => {
    expect(safeReturnTo(value)).toBe(value);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['number', 5],
    ['absolute https', 'https://evil.com'],
    ['protocol-relative', '//evil.com'],
    ['slash backslash', '/\\evil.com'],
    ['double backslash', '\\\\evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['tab inside', '/\tevil'],
    ['leading space', ' /ok'],
    ['too long', '/' + 'a'.repeat(2048)],
    ['dot-segment protocol-relative', '/.//evil.com'],
    ['parent-segment protocol-relative', '/a/..//evil.com'],
    ['encoded dot protocol-relative', '/%2e//evil.com'],
    ['login path', '/login?x=1'],
    ['session-expired path', '/session-expired'],
  ])('falls back to / for %s', (_label, value) => {
    expect(safeReturnTo(value)).toBe('/');
  });
});

describe('loginUrl', () => {
  it('has no query without options', () => {
    expect(loginUrl()).toBe('/login');
  });

  it('omits returnTo when it is /', () => {
    expect(loginUrl({ reason: 'expired', returnTo: '/' })).toBe(
      '/login?reason=expired',
    );
  });

  it('encodes returnTo', () => {
    expect(loginUrl({ reason: 'expired', returnTo: '/a?b=1' })).toBe(
      '/login?reason=expired&returnTo=%2Fa%3Fb%3D1',
    );
  });
});
