import Form from 'next/form';
import Link from 'next/link';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { LICENSE_STATUSES, LICENSE_STATUS_LABELS } from '@/lib/license-status';
import {
  DEFAULT_LIMIT,
  driverListHref,
  type DriverListQuery,
} from '../_lib/list-params';

/**
 * GET form: submitting navigates to /drivers?licenseStatus=…, which drops
 * `page` and `notice` and keeps a non-default `limit`.
 */
export function DriverFilters({ query }: { query: DriverListQuery }) {
  return (
    <Form
      key={JSON.stringify([query.licenseStatus ?? ''])}
      action="/drivers"
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Filter drivers"
    >
      {query.limit !== DEFAULT_LIMIT ? (
        <input type="hidden" name="limit" value={query.limit} />
      ) : null}
      <FormField name="licenseStatus" label="License">
        {(props) => (
          <NativeSelect
            {...props}
            name="licenseStatus"
            defaultValue={query.licenseStatus ?? ''}
          >
            <NativeSelectOption value="">Any</NativeSelectOption>
            {LICENSE_STATUSES.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {LICENSE_STATUS_LABELS[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div className="mt-5 flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" asChild>
          <Link href={driverListHref({ limit: query.limit })}>
            Clear filters
          </Link>
        </Button>
      </div>
    </Form>
  );
}
