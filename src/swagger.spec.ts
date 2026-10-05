import { isSwaggerEnabled } from './swagger.js';

describe('isSwaggerEnabled', () => {
  it.each([
    ['development', true],
    ['test', true],
    ['production', false],
  ])('%s -> %s', (env, expected) => {
    expect(isSwaggerEnabled(env)).toBe(expected);
  });
});
