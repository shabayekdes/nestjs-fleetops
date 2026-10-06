import { describe, expect, it } from 'vitest';
import { isUuid } from './ids';

describe('isUuid', () => {
  it('accepts canonical UUIDs in any case', () => {
    expect(isUuid('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe(true);
    expect(isUuid('0190A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5B')).toBe(true);
  });

  it.each([
    '',
    'not-a-uuid',
    '..%2Fusers',
    '../users',
    '0190a1b2c3d47e5f8a9b0c1d2e3f4a5b',
    '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/x',
    ' 0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
    '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5g',
  ])('rejects %j', (id) => {
    expect(isUuid(id)).toBe(false);
  });
});
