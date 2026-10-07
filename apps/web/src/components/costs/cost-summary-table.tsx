import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CostSummary } from '@/lib/api/types';
import { formatDecimal, formatMonth } from '@/lib/format';

const NUMBER = 'text-right tabular-nums';

/** Months in the API's ascending order, then a Total row from `totals`. */
export function CostSummaryTable({ summary }: { summary: CostSummary }) {
  const { months, totals } = summary;
  return (
    <Table>
      <TableCaption className="sr-only">
        Monthly costs from {formatMonth(summary.from)} to{' '}
        {formatMonth(summary.to)}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead className="text-right">Maintenance</TableHead>
          <TableHead className="text-right">Fuel</TableHead>
          <TableHead className="text-right">Fuel (liters)</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {months.map((month) => (
          <TableRow key={month.month}>
            <TableCell>{formatMonth(month.month)}</TableCell>
            <TableCell className={NUMBER}>
              {formatDecimal(month.maintenanceCost, 2)}
            </TableCell>
            <TableCell className={NUMBER}>
              {formatDecimal(month.fuelCost, 2)}
            </TableCell>
            <TableCell className={NUMBER}>
              {formatDecimal(month.fuelLiters, 3)}
            </TableCell>
            <TableCell className={NUMBER}>
              {formatDecimal(month.totalCost, 2)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope="row">Total</TableHead>
          <TableCell className={`${NUMBER} font-medium`}>
            {formatDecimal(totals.maintenanceCost, 2)}
          </TableCell>
          <TableCell className={`${NUMBER} font-medium`}>
            {formatDecimal(totals.fuelCost, 2)}
          </TableCell>
          <TableCell className={`${NUMBER} font-medium`}>
            {formatDecimal(totals.fuelLiters, 3)}
          </TableCell>
          <TableCell className={`${NUMBER} font-medium`}>
            {formatDecimal(totals.totalCost, 2)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
