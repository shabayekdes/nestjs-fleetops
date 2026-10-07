import { describe, expect, it } from 'vitest';
import {
  barHeights,
  niceYScale,
  showMonthLabel,
  toPixelValue,
} from './chart-scale';

describe('toPixelValue', () => {
  it('parses decimals and never returns NaN, negatives or Infinity', () => {
    expect(toPixelValue('1200.50')).toBe(1200.5);
    expect(toPixelValue('9999999999.99')).toBe(9999999999.99);
    for (const bad of ['', 'abc', '-5', 'Infinity', 'NaN']) {
      expect(toPixelValue(bad)).toBe(0);
    }
  });
});

describe('niceYScale', () => {
  it.each([
    [100, 50, 100],
    [87, 50, 100],
    [1200.5, 500, 1500],
    [7, 2, 8],
    [0.8, 0.2, 0.8],
    [1, 0.5, 1],
    [9999999999.99, 5e9, 1e10],
  ])('max %d gives step %d and ceiling %d', (max, step, ceiling) => {
    const scale = niceYScale(max);
    expect(scale.step).toBeCloseTo(step, 6);
    expect(scale.ceiling).toBeCloseTo(ceiling, 6);
    expect(scale.ceiling).toBeGreaterThanOrEqual(max);
  });

  it('starts the ticks at zero and ends at the ceiling in equal steps', () => {
    const { ticks, ceiling, step } = niceYScale(1200.5);
    expect(ticks).toEqual([0, 500, 1000, 1500]);
    expect(ticks[ticks.length - 1]).toBe(ceiling);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(step).toBe(500);
  });

  it('has no float noise in the ticks', () => {
    expect(niceYScale(0.3).ticks).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it('gives a 0 to 1 axis for zero, negative or non-finite maxima', () => {
    for (const max of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(niceYScale(max)).toEqual({ ceiling: 1, step: 1, ticks: [0, 1] });
    }
  });
});

describe('barHeights', () => {
  it('scales both segments to the plot height', () => {
    expect(barHeights(50, 25, 100, 200)).toEqual({
      maintenance: 100,
      fuel: 50,
    });
  });

  it('returns zero heights for a zero month', () => {
    expect(barHeights(0, 0, 100, 200)).toEqual({ maintenance: 0, fuel: 0 });
  });

  it('never exceeds the plot height and never goes negative or NaN', () => {
    const over = barHeights(80, 80, 100, 200);
    expect(over.maintenance + over.fuel).toBeLessThanOrEqual(200);
    for (const bad of [
      barHeights(-1, Number.NaN, 100, 200),
      barHeights(1, 1, 0, 200),
      barHeights(1, 1, 100, 0),
      barHeights(Number.POSITIVE_INFINITY, 1, 100, 200),
    ]) {
      expect(bad.maintenance).toBeGreaterThanOrEqual(0);
      expect(bad.fuel).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(bad.maintenance + bad.fuel)).toBe(false);
    }
  });
});

describe('showMonthLabel', () => {
  it('labels every month up to 12 and every other month above', () => {
    expect(Array.from({ length: 12 }, (_, i) => showMonthLabel(i, 12))).toEqual(
      Array(12).fill(true),
    );
    expect(Array.from({ length: 4 }, (_, i) => showMonthLabel(i, 13))).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
