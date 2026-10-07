'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FuelLog } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import {
  FUEL_FIELDS,
  changedFuelFields,
  fuelInputToValues,
  fuelSchema,
  toCreateBody,
  type FuelField,
  type FuelFormValues,
  type FuelInput,
} from './_lib/fuel-schema';

export type FuelFormState = FormState<FuelField>;

const OUT_OF_DATE_MESSAGE =
  'This form is out of date. Reload the page and try again.';
const NOT_FOUND_MESSAGE = 'This vehicle or fuel log no longer exists.';

function readValues(formData: FormData): FuelFormValues {
  const values: FuelFormValues = {};
  for (const field of FUEL_FIELDS) values[field] = formText(formData, field);
  return values;
}

function listPath(vehicleId: string): string {
  return `/vehicles/${vehicleId}/fuel`;
}

function logsPath(vehicleId: string): `/${string}` {
  return `/vehicles/${encodeURIComponent(vehicleId)}/fuel-logs`;
}

function revalidateVehicles() {
  revalidatePath('/vehicles', 'layout');
}

// A 401 inside these actions is handled by sessionApiRequest (it clears the
// cookie and redirects to login), so unsaved input is lost. Documented.

export async function createFuelLog(
  vehicleId: string,
  _previous: FuelFormState,
  formData: FormData,
): Promise<FuelFormState> {
  const values = readValues(formData);
  if (!isUuid(vehicleId)) return { values, formError: OUT_OF_DATE_MESSAGE };

  const parsed = fuelSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await sessionApiRequest<FuelLog>(logsPath(vehicleId), {
      method: 'POST',
      mode: 'action',
      body: toCreateBody(parsed.data),
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: FUEL_FIELDS,
        notFoundMessage: NOT_FOUND_MESSAGE,
      }),
    };
  }

  // Outside try/catch: redirect() works by throwing.
  revalidateVehicles();
  redirect(withFlash(listPath(vehicleId), 'fuel-log-created'));
}

export async function updateFuelLog(
  vehicleId: string,
  recordId: string,
  original: FuelInput,
  _previous: FuelFormState,
  formData: FormData,
): Promise<FuelFormState> {
  const values = readValues(formData);

  // `original` is a bound argument; do not trust its shape.
  if (typeof original !== 'object' || original === null) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }
  const originalParsed = fuelSchema.safeParse(fuelInputToValues(original));
  if (!isUuid(vehicleId) || !isUuid(recordId) || !originalParsed.success) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }

  const parsed = fuelSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const changes = changedFuelFields(originalParsed.data, parsed.data);
  if (Object.keys(changes).length === 0) {
    redirect(listPath(vehicleId));
  }

  try {
    await sessionApiRequest<FuelLog>(
      `${logsPath(vehicleId)}/${encodeURIComponent(recordId)}`,
      { method: 'PATCH', mode: 'action', body: changes },
    );
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: FUEL_FIELDS,
        notFoundMessage: NOT_FOUND_MESSAGE,
      }),
    };
  }

  revalidateVehicles();
  redirect(withFlash(listPath(vehicleId), 'fuel-log-updated'));
}

export async function deleteFuelLog(
  vehicleId: string,
  recordId: string,
): Promise<{ error?: string }> {
  if (!isUuid(vehicleId) || !isUuid(recordId)) {
    return { error: 'Fuel log not found.' };
  }

  try {
    await sessionApiRequest<void>(
      `${logsPath(vehicleId)}/${encodeURIComponent(recordId)}`,
      { method: 'DELETE', mode: 'action' },
    );
  } catch (error) {
    const { formError } = apiErrorToFormState<FuelField>(error, {
      fields: [],
      notFoundMessage:
        'This fuel log was not found. It may already have been deleted.',
    });
    return { error: formError ?? 'The fuel log could not be deleted.' };
  }

  revalidateVehicles();
  redirect(withFlash(listPath(vehicleId), 'fuel-log-deleted'));
}
