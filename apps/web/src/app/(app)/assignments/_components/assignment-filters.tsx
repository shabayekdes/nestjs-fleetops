import Form from 'next/form';
import Link from 'next/link';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  DEFAULT_LIMIT,
  assignmentListHref,
  type AssignmentsPageQuery,
} from '../_lib/list-params';

/**
 * GET form: submitting navigates to /assignments?active=…, which drops `page`
 * and `notice` and keeps a non-default `limit`.
 */
export function AssignmentFilters({ query }: { query: AssignmentsPageQuery }) {
  return (
    <Form
      key={JSON.stringify([query.active ?? ''])}
      action="/assignments"
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Filter assignments"
    >
      {query.limit !== DEFAULT_LIMIT ? (
        <input type="hidden" name="limit" value={query.limit} />
      ) : null}
      <FormField name="active" label="Status">
        {(props) => (
          <NativeSelect
            {...props}
            name="active"
            defaultValue={
              query.active === undefined ? '' : String(query.active)
            }
          >
            <NativeSelectOption value="">All</NativeSelectOption>
            <NativeSelectOption value="true">Current</NativeSelectOption>
            <NativeSelectOption value="false">Ended</NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
      <div className="mt-5 flex items-center gap-2">
        <Button type="submit">Apply filters</Button>
        <Button variant="outline" asChild>
          <Link href={assignmentListHref({ limit: query.limit })}>
            Clear filters
          </Link>
        </Button>
      </div>
    </Form>
  );
}
