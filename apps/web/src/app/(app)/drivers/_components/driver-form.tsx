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
import type { FormState } from '@/lib/forms/form-state';
import type { DriverField, DriverFormValues } from '../_lib/driver-schema';

type State = FormState<DriverField>;

export type UserOption = { id: string; label: string };

type Props = {
  action: (previous: State, formData: FormData) => Promise<State>;
  initialValues: DriverFormValues;
  /** The login account picker. Omit it (managers) to leave the field out. */
  userOptions?: UserOption[];
  /** More users exist than the picker lists. */
  usersTruncated?: boolean;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function DriverForm({
  action,
  initialValues,
  userOptions,
  usersTruncated = false,
  submitLabel,
  pendingLabel,
  cancelHref,
}: Props) {
  const [state, formAction] = useActionState(action, { values: {} } as State);

  // React resets the form after an action, so defaults come from the echoed
  // values first and the initial values second.
  function value(field: DriverField): string {
    return state.values[field] ?? initialValues[field] ?? '';
  }

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
            autoComplete="off"
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
            autoComplete="off"
            defaultValue={value('lastName')}
          />
        )}
      </FormField>

      <FormField
        name="licenseNumber"
        label="License number"
        hint="Letters, digits, spaces and hyphens. Saved in upper case."
        errors={state.fieldErrors?.licenseNumber}
      >
        {(props) => (
          <Input
            {...props}
            name="licenseNumber"
            required
            maxLength={30}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            defaultValue={value('licenseNumber')}
          />
        )}
      </FormField>

      <FormField
        name="licenseExpiresOn"
        label="License expires on"
        hint="Valid through this date (UTC)."
        errors={state.fieldErrors?.licenseExpiresOn}
      >
        {(props) => (
          <Input
            {...props}
            name="licenseExpiresOn"
            type="date"
            required
            className="w-fit"
            defaultValue={value('licenseExpiresOn')}
          />
        )}
      </FormField>

      {userOptions ? (
        <FormField
          name="userId"
          label="Login account"
          hint={
            usersTruncated
              ? 'Links this driver to a login account. A user can be linked to one driver only. Only the 100 most recently added users are listed.'
              : 'Links this driver to a login account. A user can be linked to one driver only.'
          }
          errors={state.fieldErrors?.userId}
        >
          {(props) => (
            <NativeSelect
              {...props}
              name="userId"
              // Remount when the echoed value changes: React's form reset
              // would otherwise fall back to the first option.
              key={value('userId')}
              defaultValue={value('userId')}
            >
              <NativeSelectOption value="">Not linked</NativeSelectOption>
              {userOptions.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
