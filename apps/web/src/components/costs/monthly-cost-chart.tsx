import { useId } from 'react';
import type { CostSummary } from '@/lib/api/types';
import {
  barHeights,
  niceYScale,
  showMonthLabel,
  toPixelValue,
} from '@/lib/costs/chart-scale';
import { formatDecimal, formatMonth } from '@/lib/format';

const WIDTH = 720;
const HEIGHT = 280;
const MARGIN = { top: 12, right: 8, bottom: 30, left: 56 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const BAR_FILL = 0.62;

const tickFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Stacked monthly bars (maintenance plus fuel) as hand-written SVG; no chart
 * library and no client JS. Pixel positions use `Number()`, but every amount a
 * person reads (the bar titles) is the API string through `formatDecimal`. The
 * chart is a summary: the data table next to it lists the same values.
 */
export function MonthlyCostChart({ summary }: { summary: CostSummary }) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const { months } = summary;

  const bars = months.map((month) => ({
    month,
    maintenance: toPixelValue(month.maintenanceCost),
    fuel: toPixelValue(month.fuelCost),
  }));
  const max = Math.max(0, ...bars.map((bar) => bar.maintenance + bar.fuel));
  const scale = niceYScale(max);
  const slot = months.length > 0 ? PLOT_WIDTH / months.length : PLOT_WIDTH;
  const barWidth = slot * BAR_FILL;
  const baseline = MARGIN.top + PLOT_HEIGHT;
  const yFor = (value: number) =>
    MARGIN.top + PLOT_HEIGHT - (value / scale.ceiling) * PLOT_HEIGHT;

  return (
    <figure className="mb-6">
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[34rem]"
        >
          <title id={titleId}>Monthly costs</title>
          <desc id={descId}>
            Monthly maintenance and fuel costs, {formatMonth(summary.from)}–
            {formatMonth(summary.to)}. The data table lists the values.
          </desc>

          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={yFor(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {tickFormatter.format(tick)}
              </text>
            </g>
          ))}

          {bars.map(({ month, maintenance, fuel }, index) => {
            const x = MARGIN.left + index * slot + (slot - barWidth) / 2;
            const heights = barHeights(
              maintenance,
              fuel,
              scale.ceiling,
              PLOT_HEIGHT,
            );
            return (
              <g key={month.month} data-month={month.month}>
                <title>
                  {`${formatMonth(month.month)}: maintenance ${formatDecimal(month.maintenanceCost, 2)}, fuel ${formatDecimal(month.fuelCost, 2)}, total ${formatDecimal(month.totalCost, 2)}`}
                </title>
                <rect
                  x={x}
                  y={baseline - heights.maintenance}
                  width={barWidth}
                  height={heights.maintenance}
                  fill="var(--chart-1)"
                />
                <rect
                  x={x}
                  y={baseline - heights.maintenance - heights.fuel}
                  width={barWidth}
                  height={heights.fuel}
                  fill="var(--chart-2)"
                />
                {showMonthLabel(index, months.length) ? (
                  <text
                    x={x + barWidth / 2}
                    y={baseline + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--muted-foreground)"
                  >
                    {formatMonth(month.month)}
                  </text>
                ) : null}
              </g>
            );
          })}

          <line
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={baseline}
            y2={baseline}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
        </svg>
      </div>
      <figcaption>
        <ul className="text-muted-foreground mt-2 flex gap-4 text-sm">
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: 'var(--chart-1)' }}
            />
            Maintenance
          </li>
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-sm"
              style={{ backgroundColor: 'var(--chart-2)' }}
            />
            Fuel
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
