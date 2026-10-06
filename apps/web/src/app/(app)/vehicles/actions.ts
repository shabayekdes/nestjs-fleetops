'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
  Vehicle,
} from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import {
  VEHICLE_FIELDS,
  changedVehicleFields,
  createVehicleSchema,
  type VehicleField,
  type VehicleFormValues,
  type VehicleInput,
} from './_lib/vehicle-schema';

export type VehicleFormState = FormState<VehicleField>;

const OUT_OF_DATE_MESSAGE =
  'This form is out of date. Reload the page and try again.';

function readValues(formData: FormData): VehicleFormValues {
  const values: VehicleFormValues = {};
  for (const field of VEHICLE_FIELDS) values[field] = formText(formData, field);
  return values;
}

function revalidateVehicles() {
  revalidatePath('/vehicles', 'layout');
}

// A 401 inside these actions is handled by sessionApiRequest (it clears the
// cookie and redirects to login), so unsaved input is lost. Documented.

export async function createVehicle(
  _previous: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const values = readValues(formData);
  const parsed = createVehicleSchema().safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const { licensePlate, ...rest } = parsed.data;
  // The API rejects an empty plate, so leave the field out when there is none.
  const body: CreateVehicleRequest =
    licensePlate === null ? rest : { ...rest, licensePlate };

  let created: Vehicle;
  try {
    created = await sessionApiRequest<Vehicle>('/vehicles', {
      method: 'POST',
      mode: 'action',
      body,
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: VEHICLE_FIELDS,
        notFoundMessage: 'The vehicle could not be created.',
      }),
    };
  }

  // Outside try/catch: redirect() works by throwing.
  revalidateVehicles();
  redirect(withFlash(`/vehicles/${created.id}`, 'vehicle-created'));
}

export async function updateVehicle(
  id: string,
  original: VehicleInput,
  _previous: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const values = readValues(formData);
  const schema = createVehicleSchema();

  // `original` is a bound argument; do not trust its shape.
  if (typeof original !== 'object' || original === null) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }

  const originalParsed = schema.safeParse({
    ...original,
    year: String(original.year),
    licensePlate: original.licensePlate ?? '',
  });
  if (!isUuid(id) || !originalParsed.success) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const changes: UpdateVehicleRequest = changedVehicleFields(
    originalParsed.data,
    parsed.data,
  );
  if (Object.keys(changes).length === 0) {
    redirect(`/vehicles/${id}`);
  }

  try {
    await sessionApiRequest<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      mode: 'action',
      body: changes,
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: VEHICLE_FIELDS,
        notFoundMessage: 'This vehicle no longer exists.',
      }),
    };
  }

  revalidateVehicles();
  redirect(withFlash(`/vehicles/${id}`, 'vehicle-updated'));
}

export async function deleteVehicle(id: string): Promise<{ error?: string }> {
  if (!isUuid(id)) return { error: 'Vehicle not found.' };

  try {
    await sessionApiRequest<void>(`/vehicles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      mode: 'action',
    });
  } catch (error) {
    const { formError } = apiErrorToFormState<VehicleField>(error, {
      fields: [],
      notFoundMessage:
        'This vehicle was not found. It may already have been deleted.',
    });
    return { error: formError ?? 'The vehicle could not be deleted.' };
  }

  revalidateVehicles();
  redirect(withFlash('/vehicles', 'vehicle-deleted'));
}
