import Form from 'next/form';
import Link from 'next/link';
import { FilterSubmitButton } from '@/components/form/filter-submit-button';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { ROLES, formatRole } from '@/lib/auth/roles';
import { DEFAULT_LIMIT } from '@/lib/list-params';
import { userListHref, type UserListQuery } from '../_lib/list-params';

/**
 * GET form: submitting navigates to /users?role=…, which drops `page` and
 * `notice` and keeps a non-default `limit`.
 */
export function UserFilters({ query }: { query: UserListQuery }) {
  return (
    <Form
      key={JSON.stringify([query.role ?? ''])}
      action="/users"
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Filter users"
    >
      {query.limit !== DEFAULT_LIMIT ? (
        <input type="hidden" name="limit" value={query.limit} />
      ) : null}
      <FormField name="role" label="Role">
        {(props) => (
          <NativeSelect {...props} name="role" defaultValue={query.role ?? ''}>
            <NativeSelectOption value="">All roles</NativeSelectOption>
            {ROLES.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {formatRole(role)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div className="mt-5 flex items-center gap-2">
        <FilterSubmitButton>Apply</FilterSubmitButton>
        <Button variant="outline" asChild>
          <Link href={userListHref({ limit: query.limit })}>Clear filters</Link>
        </Button>
      </div>
    </Form>
  );
}
