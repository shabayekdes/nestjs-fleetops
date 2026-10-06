'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormError } from '@/components/form/form-error';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { ROLES, formatRole } from '@/lib/auth/roles';
import type { FormState } from '@/lib/forms/form-state';
import type { UserField, UserFormValues } from '../_lib/user-schema';

type State = FormState<UserField>;

type Props = {
  mode: 'create' | 'edit';
  action: (previous: State, formData: FormData) => Promise<State>;
  initialValues: UserFormValues;
  /** Edit mode only: the user is editing their own record. */
  isSelf?: boolean;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function UserForm({
  mode,
  action,
  initialValues,
  isSelf = false,
  submitLabel,
  pendingLabel,
  cancelHref,
}: Props) {
  const [state, formAction] = useActionState(action, { values: {} } as State);

  // React resets the form after an action, so defaults come from the echoed
  // values first and the initial values second. Passwords are never echoed.
  function value(field: UserField): string {
    return state.values[field] ?? initialValues[field] ?? '';
  }

  const roleLocked = mode === 'edit' && isSelf;

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <FormError message={state.formError} />

      <FormField
        name="firstName"
        label="First name"
        errors={state.fieldErrors?.firstName}
      >
        {(props) => (
          <Input
            {...props}
            name="firstName"
            required
            maxLength={100}
            autoComplete="given-name"
            defaultValue={value('firstName')}
          />
        )}
      </FormField>

      <FormField
        name="lastName"
        label="Last name"
        errors={state.fieldErrors?.lastName}
      >
        {(props) => (
          <Input
            {...props}
            name="lastName"
            required
            maxLength={100}
            autoComplete="family-name"
            defaultValue={value('lastName')}
          />
        )}
      </FormField>

      <FormField name="email" label="Email" errors={state.fieldErrors?.email}>
        {(props) => (
          <Input
            {...props}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            spellCheck={false}
            defaultValue={value('email')}
          />
        )}
      </FormField>

      {mode === 'create' ? (
        <FormField
          name="password"
          label="Password"
          hint="12 to 128 characters."
          errors={state.fieldErrors?.password}
        >
          {(props) => (
            <Input
              {...props}
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          )}
        </FormField>
      ) : null}

      <FormField
        name="role"
        label="Role"
        hint={roleLocked ? 'You cannot change your own role.' : undefined}
        errors={state.fieldErrors?.role}
      >
        {(props) => (
          <NativeSelect
            {...props}
            name="role"
            // Remount when the echoed value changes: React's form reset
            // would otherwise fall back to the first option.
            key={value('role')}
            required
            disabled={roleLocked}
            defaultValue={value('role')}
          >
            {mode === 'create' ? (
              <NativeSelectOption value="">Choose a role</NativeSelectOption>
            ) : null}
            {ROLES.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {formatRole(role)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
