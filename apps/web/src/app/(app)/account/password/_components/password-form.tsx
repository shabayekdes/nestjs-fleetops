'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/form/form-error';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/lib/forms/form-state';
import { changePassword } from '../actions';
import type { PasswordField } from '../_lib/password-schema';

type State = FormState<PasswordField>;

/** Password inputs never get a default value: nothing is echoed back. */
export function PasswordForm() {
  const [state, formAction] = useActionState(changePassword, {
    values: {},
  } as State);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <FormError message={state.formError} />

      <FormField
        name="currentPassword"
        label="Current password"
        errors={state.fieldErrors?.currentPassword}
      >
        {(props) => (
          <Input
            {...props}
            name="currentPassword"
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
          />
        )}
      </FormField>

      <FormField
        name="newPassword"
        label="New password"
        hint="12 to 128 characters. Must differ from your current password."
        errors={state.fieldErrors?.newPassword}
      >
        {(props) => (
          <Input
            {...props}
            name="newPassword"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        )}
      </FormField>

      <FormField
        name="confirmPassword"
        label="Confirm new password"
        errors={state.fieldErrors?.confirmPassword}
      >
        {(props) => (
          <Input
            {...props}
            name="confirmPassword"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        )}
      </FormField>

      <SubmitButton label="Change password" pendingLabel="Changing…" />
    </form>
  );
}
