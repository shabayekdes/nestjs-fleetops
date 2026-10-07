/**
 * Pure geometry for the monthly cost chart. `Number()` on API decimal strings
 * is used here only to place pixels; every amount the user reads is the API
 * string formatted with `formatDecimal`.
 */

const NICE_STEPS = [1, 2, 5, 10] as const;
const TARGET_INTERVALS = 4;

export type YScale = {
  /** Top of the axis: a multiple of `step`, at least the largest value. */
  ceiling: number;
  step: number;
  /** 0, step, 2 * step, ... ceiling. */
  ticks: number[];
};

/** A finite, non-negative number from an API decimal string, else 0. */
export function toPixelValue(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * A "nice" y-axis for values from 0 to `max`: a step of 1, 2 or 5 times a
 * power of ten, giving about four intervals. A max of zero (or less, or not
 * finite) gives a 0 to 1 axis, so an all-zero chart still has a scale.
 */
export function niceYScale(max: number): YScale {
  if (!Number.isFinite(max) || max <= 0) {
    return { ceiling: 1, step: 1, ticks: [0, 1] };
  }
  const rawStep = max / TARGET_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    (NICE_STEPS.find((n) => n * magnitude >= rawStep) ?? 10) * magnitude;
  const intervals = Math.max(1, Math.ceil(max / step - 1e-9));
  const ticks = Array.from({ length: intervals + 1 }, (_, i) =>
    Number((i * step).toPrecision(12)),
  );
  return { ceiling: ticks[ticks.length - 1] as number, step, ticks };
}

export type BarGeometry = {
  /** Height of the maintenance segment (drawn at the bottom). */
  maintenance: number;
  /** Height of the fuel segment (stacked on top of maintenance). */
  fuel: number;
};

/**
 * Segment heights in pixels for one stacked bar. Never negative or NaN, and
 * the stack never exceeds `plotHeight`.
 */
export function barHeights(
  maintenance: number,
  fuel: number,
  ceiling: number,
  plotHeight: number,
): BarGeometry {
  if (!(ceiling > 0) || !(plotHeight > 0)) return { maintenance: 0, fuel: 0 };
  const m = Number.isFinite(maintenance) && maintenance > 0 ? maintenance : 0;
  const f = Number.isFinite(fuel) && fuel > 0 ? fuel : 0;
  const scale = plotHeight / ceiling;
  const maintenanceHeight = Math.min(m * scale, plotHeight);
  const fuelHeight = Math.min(f * scale, plotHeight - maintenanceHeight);
  return { maintenance: maintenanceHeight, fuel: fuelHeight };
}

/** Whether the label of the month at `index` is drawn (every other month above 12). */
export function showMonthLabel(index: number, count: number): boolean {
  return count <= 12 || index % 2 === 0;
}
