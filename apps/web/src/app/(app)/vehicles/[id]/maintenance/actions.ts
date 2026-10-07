'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { MaintenanceRecord } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { isUuid } from '@/lib/ids';
import {
  MAINTENANCE_FIELDS,
  changedMaintenanceFields,
  maintenanceInputToValues,
  maintenanceSchema,
  toCreateBody,
  type MaintenanceField,
  type MaintenanceFormValues,
  type MaintenanceInput,
} from './_lib/maintenance-schema';

export type MaintenanceFormState = FormState<MaintenanceField>;

const OUT_OF_DATE_MESSAGE =
  'This form is out of date. Reload the page and try again.';
const NOT_FOUND_MESSAGE =
  'This vehicle or maintenance record no longer exists.';

function readValues(formData: FormData): MaintenanceFormValues {
  const values: MaintenanceFormValues = {};
  for (const field of MAINTENANCE_FIELDS) {
    values[field] = formText(formData, field);
  }
  return values;
}

function listPath(vehicleId: string): string {
  return `/vehicles/${vehicleId}/maintenance`;
}

function recordsPath(vehicleId: string): `/${string}` {
  return `/vehicles/${encodeURIComponent(vehicleId)}/maintenance-records`;
}

function revalidateVehicles() {
  revalidatePath('/vehicles', 'layout');
}

// A 401 inside these actions is handled by sessionApiRequest (it clears the
// cookie and redirects to login), so unsaved input is lost. Documented.

export async function createMaintenanceRecord(
  vehicleId: string,
  _previous: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const values = readValues(formData);
  if (!isUuid(vehicleId)) return { values, formError: OUT_OF_DATE_MESSAGE };

  const parsed = maintenanceSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  try {
    await sessionApiRequest<MaintenanceRecord>(recordsPath(vehicleId), {
      method: 'POST',
      mode: 'action',
      body: toCreateBody(parsed.data),
    });
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: MAINTENANCE_FIELDS,
        notFoundMessage: NOT_FOUND_MESSAGE,
      }),
    };
  }

  // Outside try/catch: redirect() works by throwing.
  revalidateVehicles();
  redirect(withFlash(listPath(vehicleId), 'maintenance-created'));
}

export async function updateMaintenanceRecord(
  vehicleId: string,
  recordId: string,
  original: MaintenanceInput,
  _previous: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const values = readValues(formData);

  // `original` is a bound argument; do not trust its shape.
  if (typeof original !== 'object' || original === null) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }
  const originalParsed = maintenanceSchema.safeParse(
    maintenanceInputToValues(original),
  );
  if (!isUuid(vehicleId) || !isUuid(recordId) || !originalParsed.success) {
    return { values, formError: OUT_OF_DATE_MESSAGE };
  }

  const parsed = maintenanceSchema.safeParse(values);
  if (!parsed.success) {
    return { values, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const changes = changedMaintenanceFields(originalParsed.data, parsed.data);
  if (Object.keys(changes).length === 0) {
    redirect(listPath(vehicleId));
  }

  try {
    await sessionApiRequest<MaintenanceRecord>(
      `${recordsPath(vehicleId)}/${encodeURIComponent(recordId)}`,
      { method: 'PATCH', mode: 'action', body: changes },
    );
  } catch (error) {
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: MAINTENANCE_FIELDS,
        notFoundMessage: NOT_FOUND_MESSAGE,
      }),
    };
  }

  revalidateVehicles();
  redirect(withFlash(listPath(vehicleId), 'maintenance-updated'));
}

export async function deleteMaintenanceRecord(
  vehicleId: string,
  recordId: string,
): Promise<{ error?: string }> {
  if (!isUuid(vehicleId) || !isUuid(recordId)) {
    return { error: 'Maintenance record not found.' };
  }

  try {
    await sessionApiRequest<void>(
      `${recordsPath(vehicleId)}/${encodeURIComponent(recordId)}`,
      { method: 'DELETE', mode: 'action' },
    );
  } catch (error) {
    const { formError } = apiErrorToFormState<MaintenanceField>(error, {
      fields: [],
      notFoundMessage:
        'This maintenance record was not found. It may already have been deleted.',
    });
    return { error: formError ?? 'The record could not be deleted.' };
  }

  revalidateVehicles();
  redirect(withFlash(listPath(vehicleId), 'maintenance-deleted'));
}
