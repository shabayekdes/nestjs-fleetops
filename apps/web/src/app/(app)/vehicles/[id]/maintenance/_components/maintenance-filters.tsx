import Form from 'next/form';
import Link from 'next/link';
import { FilterSubmitButton } from '@/components/form/filter-submit-button';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  DEFAULT_LIMIT,
  maintenanceListHref,
  maintenancePath,
  type MaintenanceListQuery,
} from '../_lib/list-params';
import {
  MAINTENANCE_TYPES,
  MAINTENANCE_TYPE_LABELS,
} from '../_lib/maintenance-types';

/**
 * GET form: submitting navigates to the list with the filters, which drops
 * `page` and `notice` and keeps a non-default `limit`.
 */
export function MaintenanceFilters({
  vehicleId,
  query,
}: {
  vehicleId: string;
  query: MaintenanceListQuery;
}) {
  return (
    <Form
      key={JSON.stringify([query.type, query.from, query.to])}
      action={maintenancePath(vehicleId)}
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Filter maintenance records"
    >
      {query.limit !== DEFAULT_LIMIT ? (
        <input type="hidden" name="limit" value={query.limit} />
      ) : null}
      <FormField name="type" label="Type">
        {(props) => (
          <NativeSelect {...props} name="type" defaultValue={query.type ?? ''}>
            <NativeSelectOption value="">Any</NativeSelectOption>
            {MAINTENANCE_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {MAINTENANCE_TYPE_LABELS[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
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
        <FilterSubmitButton>Apply filters</FilterSubmitButton>
        <Button variant="outline" asChild>
          <Link href={maintenanceListHref(vehicleId, { limit: query.limit })}>
            Clear filters
          </Link>
        </Button>
      </div>
    </Form>
  );
}
