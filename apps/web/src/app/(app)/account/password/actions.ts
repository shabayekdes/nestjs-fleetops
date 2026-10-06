'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import type { ChangePasswordRequest } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { passwordSchema, type PasswordField } from './_lib/password-schema';

export type PasswordFormState = FormState<PasswordField>;

/**
 * Passwords are never echoed: `values` is always empty, so the inputs come
 * back blank after an error.
 */
export async function changePassword(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const parsed = passwordSchema.safeParse({
    currentPassword: formText(formData, 'currentPassword'),
    newPassword: formText(formData, 'newPassword'),
    confirmPassword: formText(formData, 'confirmPassword'),
  });
  if (!parsed.success) {
    return {
      values: {},
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const body: ChangePasswordRequest = {
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  };

  try {
    await sessionApiRequest<void>('/auth/me/password', {
      method: 'PATCH',
      mode: 'action',
      body,
    });
  } catch (error) {
    // The two 400s (wrong current password, new equals current) carry no
    // field details, so they come back as a form-level message.
    return {
      values: {},
      ...apiErrorToFormState(error, {
        fields: ['currentPassword', 'newPassword'] as const,
        notFoundMessage: 'The password could not be changed.',
      }),
    };
  }

  redirect(withFlash('/account/password', 'password-changed'));
}
