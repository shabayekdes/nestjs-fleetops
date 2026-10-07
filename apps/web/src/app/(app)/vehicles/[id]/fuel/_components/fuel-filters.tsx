import Form from 'next/form';
import Link from 'next/link';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_LIMIT,
  fuelListHref,
  fuelPath,
  type FuelListQuery,
} from '../_lib/list-params';

/**
 * GET form: submitting navigates to the list with the filters, which drops
 * `page` and `notice` and keeps a non-default `limit`.
 */
export function FuelFilters({
  vehicleId,
  query,
}: {
  vehicleId: string;
  query: FuelListQuery;
}) {
  return (
    <Form
      action={fuelPath(vehicleId)}
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Filter fuel logs"
    >
      {query.limit !== DEFAULT_LIMIT ? (
        <input type="hidden" name="limit" value={query.limit} />
      ) : null}
      <FormField name="from" label="From">
        {(props) => (
          <Input
            {...props}
            name="from"
            type="date"
            className="w-44"
            defaultValue={query.from ?? ''}
          />
        )}
      </FormField>
      <FormField name="to" label="To">
        {(props) => (
          <Input
            {...props}
            name="to"
            type="date"
            className="w-44"
            defaultValue={query.to ?? ''}
          />
        )}
      </FormField>
      <div className="mt-5 flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" asChild>
          <Link href={fuelListHref(vehicleId, { limit: query.limit })}>
            Clear filters
          </Link>
        </Button>
      </div>
    </Form>
  );
}
