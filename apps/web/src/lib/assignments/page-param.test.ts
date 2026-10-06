import { describe, expect, it } from 'vitest';
import { parseAssignmentsPage } from './page-param';

describe('parseAssignmentsPage', () => {
  it('reads a valid page and silently falls back to 1', () => {
    expect(parseAssignmentsPage({ assignmentsPage: '4' })).toBe(4);
    for (const value of ['0', 'abc', '-1', ['1', '2'], undefined]) {
      expect(parseAssignmentsPage({ assignmentsPage: value })).toBe(1);
    }
    expect(parseAssignmentsPage({})).toBe(1);
  });
});
