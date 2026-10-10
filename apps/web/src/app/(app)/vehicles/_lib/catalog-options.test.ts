import { describe, expect, it } from 'vitest';
import { withRetired } from './catalog-options';

const toyota = { id: 'a', name: 'Toyota' };
const ford = { id: 'b', name: 'Ford' };

describe('withRetired', () => {
  it('maps catalog entries to options', () => {
    expect(withRetired([toyota], undefined)).toEqual([
      { id: 'a', label: 'Toyota' },
    ]);
  });

  it('does not repeat a current value that is already listed', () => {
    expect(withRetired([toyota, ford], ford)).toHaveLength(2);
  });

  it('appends a current value missing from the list as retired', () => {
    expect(withRetired([toyota], ford)).toEqual([
      { id: 'a', label: 'Toyota' },
      { id: 'b', label: 'Ford (retired)' },
    ]);
  });
});
