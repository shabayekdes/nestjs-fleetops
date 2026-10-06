'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  User,
} from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import {
  USER_FIELDS,
  changedUserFields,
  createUserSchema,
  editUserSchema,
  type UserField,
  type UserFormValues,
  type UserInput,
} from './_lib/user-schema';

export type UserFormState = FormState<UserField>;

const OUT_OF_DATE_MESSAGE =
  'This form is out of date. Reload the page and try again.';

/** Passwords are never read into the echoed values. */
const ECHOED_FIELDS = USER_FIELDS.filter((field) => field !== 'password');

function readValues(formData: FormData): UserFormValues {
  const values: UserFormValues = {};
  for (const field of ECHOED_FIELDS) {
    // A disabled select is not submitted: leave `role` out so the form keeps
    // showing the user's current role.
    if (field === 'role' && !formData.has('role')) continue;
    values[field] = formText(formData, field);
  }
  return values;
}

// The header shows the user's name, so refresh the whole tree.
function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function createUser(
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const values = readValues(formData);
  const parsed = createUserSchema.safeParse({
    ...values,
    password: formText(formData, 'password'),
  });
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const body: CreateUserRequest = parsed.data;

  let created: User;
  try {
    created = await sessionApiRequest<User>('/users', {
      method: 'POST',
      mode: 'action',
      body,
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: USER_FIELDS,
        notFoundMessage: 'The user could not be created.',
      }),
    };
  }

  // Outside try/catch: redirect() works by throwing.
  revalidateAll();
  redirect(withFlash(`/users/${created.id}`, 'user-created'));
}

export async function updateUser(
  id: string,
  original: UserInput,
  _previous: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const values = readValues(formData);

  // `original` is a bound argument; do not trust its shape.
  if (typeof original !== 'object' || original === null) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }
  const originalParsed = createUserSchema
    .omit({ password: true })
    .safeParse(original);
  if (!isUuid(id) || !originalParsed.success) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }

  // A disabled select is not submitted: a missing role means "unchanged".
  const submitted = {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    role: values.role,
  };
  const parsed = editUserSchema.safeParse(submitted);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const changes: UpdateUserRequest = changedUserFields(
    originalParsed.data,
    parsed.data,
  );
  if (Object.keys(changes).length === 0) {
    redirect(`/users/${id}`);
  }

  try {
    await sessionApiRequest<User>(`/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      mode: 'action',
      body: changes,
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: USER_FIELDS,
        notFoundMessage: 'This user no longer exists.',
      }),
    };
  }

  revalidateAll();
  redirect(withFlash(`/users/${id}`, 'user-updated'));
}

export async function deleteUser(id: string): Promise<{ error?: string }> {
  if (!isUuid(id)) return { error: 'User not found.' };

  try {
    await sessionApiRequest<void>(`/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      mode: 'action',
    });
  } catch (error) {
    const { formError } = apiErrorToFormState<UserField>(error, {
      fields: [],
      notFoundMessage:
        'This user was not found. It may already have been deleted.',
    });
    return { error: formError ?? 'The user could not be deleted.' };
  }

  revalidateAll();
  redirect(withFlash('/users', 'user-deleted'));
}
