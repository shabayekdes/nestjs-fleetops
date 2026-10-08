import { escapeLike } from './like.js';

describe('escapeLike', () => {
  it.each([
    ['benz', 'benz'],
    ['%', '\\%'],
    ['_', '\\_'],
    ['\\', '\\\\'],
    ['50%_off\\x', '50\\%\\_off\\\\x'],
  ])('%j -> %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
