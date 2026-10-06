import Form from 'next/form';
import Link from 'next/link';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_LIMIT,
  vehicleListHref,
  type VehicleListQuery,
} from '../_lib/list-params';

/**
 * GET form: submitting navigates to /vehicles?make=…, which drops `page` and
 * `notice` and keeps a non-default `limit`.
 */
export function VehicleFilters({
  query,
  maxYear,
}: {
  query: VehicleListQuery;
  maxYear: number;
}) {
  return (
    <Form
      action="/vehicles"
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Filter vehicles"
    >
      {query.limit !== DEFAULT_LIMIT ? (
        <input type="hidden" name="limit" value={query.limit} />
      ) : null}
      <FormField name="make" label="Make">
        {(props) => (
          <Input
            {...props}
            name="make"
            maxLength={50}
            defaultValue={query.make ?? ''}
          />
        )}
      </FormField>
      <FormField
        name="model"
        label="Model"
        hint="Exact match, not case-sensitive"
      >
        {(props) => (
          <Input
            {...props}
            name="model"
            maxLength={50}
            defaultValue={query.model ?? ''}
          />
        )}
      </FormField>
      <FormField name="year" label="Year">
        {(props) => (
          <Input
            {...props}
            name="year"
            type="number"
            inputMode="numeric"
            min={1900}
            max={maxYear}
            step={1}
            className="w-28"
            defaultValue={query.year ?? ''}
          />
        )}
      </FormField>
      <div className="mt-5 flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" asChild>
          <Link href={vehicleListHref({ limit: query.limit }, {})}>
            Clear filters
          </Link>
        </Button>
      </div>
    </Form>
  );
}
