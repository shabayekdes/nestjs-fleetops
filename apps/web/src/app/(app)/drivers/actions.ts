'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type {
  CreateDriverRequest,
  Driver,
  UpdateDriverRequest,
} from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import {
  DRIVER_FIELDS,
  changedDriverFields,
  driverSchema,
  type DriverField,
  type DriverFormValues,
  type DriverInput,
} from './_lib/driver-schema';

export type DriverFormState = FormState<DriverField>;

const OUT_OF_DATE_MESSAGE =
  'This form is out of date. Reload the page and try again.';

/** `userId` is read only when the form has the field (admins only). */
function readValues(formData: FormData): DriverFormValues {
  const values: DriverFormValues = {};
  for (const field of DRIVER_FIELDS) {
    if (field === 'userId' && !formData.has('userId')) continue;
    values[field] = formText(formData, field);
  }
  return values;
}

function revalidateAll() {
  revalidatePath('/', 'layout');
}

export async function createDriver(
  _previous: DriverFormState,
  formData: FormData,
): Promise<DriverFormState> {
  const values = readValues(formData);
  const parsed = driverSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { userId, ...rest } = parsed.data;
  // Leave the field out when no account is chosen.
  const body: CreateDriverRequest = userId ? { ...rest, userId } : rest;

  let created: Driver;
  try {
    created = await sessionApiRequest<Driver>('/drivers', {
      method: 'POST',
      mode: 'action',
      body,
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: DRIVER_FIELDS,
        notFoundMessage: 'The driver or the selected user no longer exists.',
      }),
    };
  }

  // Outside try/catch: redirect() works by throwing.
  revalidateAll();
  redirect(withFlash(`/drivers/${created.id}`, 'driver-created'));
}

export async function updateDriver(
  id: string,
  original: DriverInput,
  _previous: DriverFormState,
  formData: FormData,
): Promise<DriverFormState> {
  const values = readValues(formData);

  // `original` is a bound argument; do not trust its shape.
  if (typeof original !== 'object' || original === null) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }
  const originalParsed = driverSchema.safeParse({
    ...original,
    userId: original.userId ?? '',
  });
  if (!isUuid(id) || !originalParsed.success) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }

  const parsed = driverSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const changes: UpdateDriverRequest = changedDriverFields(
    originalParsed.data,
    parsed.data,
  );
  if (Object.keys(changes).length === 0) {
    redirect(`/drivers/${id}`);
  }

  try {
    await sessionApiRequest<Driver>(`/drivers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      mode: 'action',
      body: changes,
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: DRIVER_FIELDS,
        notFoundMessage: 'This driver no longer exists.',
      }),
    };
  }

  revalidateAll();
  redirect(withFlash(`/drivers/${id}`, 'driver-updated'));
}

export async function deleteDriver(id: string): Promise<{ error?: string }> {
  if (!isUuid(id)) return { error: 'Driver not found.' };

  try {
    await sessionApiRequest<void>(`/drivers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      mode: 'action',
    });
  } catch (error) {
    // A 409 (the driver has assignments) shows the API's own message.
    const { formError } = apiErrorToFormState<DriverField>(error, {
      fields: [],
      notFoundMessage:
        'This driver was not found. It may already have been deleted.',
    });
    return { error: formError ?? 'The driver could not be deleted.' };
  }

  revalidateAll();
  redirect(withFlash('/drivers', 'driver-deleted'));
}
