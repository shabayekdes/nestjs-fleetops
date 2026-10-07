import { describe, expect, it } from 'vitest';
import { parseCostParams } from './cost-params';

describe('parseCostParams', () => {
  it('sends nothing when the params are absent', () => {
    expect(parseCostParams({})).toEqual({ query: {}, ignored: [] });
  });

  it('reads valid months and trims them', () => {
    expect(parseCostParams({ from: '2025-03', to: ' 2026-02 ' })).toEqual({
      query: { from: '2025-03', to: '2026-02' },
      ignored: [],
    });
  });

  it('treats empty values as absent without a warning', () => {
    expect(parseCostParams({ from: '', to: '  ' })).toEqual({
      query: {},
      ignored: [],
    });
  });

  it.each(['2026-13', '2026-00', '1899-12', '2026-3', '2026-03-01', 'abc'])(
    'ignores %j with a warning',
    (value) => {
      expect(parseCostParams({ from: value })).toEqual({
        query: {},
        ignored: ['from'],
      });
    },
  );

  it('ignores a repeated key and does not check the order', () => {
    expect(parseCostParams({ to: ['2026-01', '2026-02'] }).ignored).toEqual([
      'to',
    ]);
    expect(parseCostParams({ from: '2026-05', to: '2026-01' }).query).toEqual({
      from: '2026-05',
      to: '2026-01',
    });
  });
});
