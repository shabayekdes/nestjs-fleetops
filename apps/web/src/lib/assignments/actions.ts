'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Assignment, CreateAssignmentRequest } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import { apiErrorToFormState } from '@/lib/forms/api-error-to-form';
import { formText, type FormState } from '@/lib/forms/form-state';
import { withFlash } from '@/lib/flash';
import { isUuid } from '@/lib/ids';

export type AssignFormState = FormState<'driverId' | 'vehicleId'>;

const OUT_OF_DATE_MESSAGE =
  'This form is out of date. Reload the page and try again.';
const NOT_FOUND_MESSAGE = 'This vehicle or driver no longer exists.';

async function createAssignment(
  body: CreateAssignmentRequest,
  field: 'driverId' | 'vehicleId',
  values: AssignFormState['values'],
): Promise<AssignFormState | null> {
  try {
    await sessionApiRequest<Assignment>('/assignments', {
      method: 'POST',
      mode: 'action',
      body,
    });
  } catch (error) {
    // A 422 (expired license) and a 409 (already assigned) show the API's text.
    return {
      values,
      ...apiErrorToFormState(error, {
        fields: [field],
        notFoundMessage: NOT_FOUND_MESSAGE,
      }),
    };
  }
  return null;
}

/** Assigns the chosen driver to a vehicle (the vehicle page's form). */
export async function assignDriverToVehicle(
  vehicleId: string,
  _previous: AssignFormState,
  formData: FormData,
): Promise<AssignFormState> {
  const driverId = formText(formData, 'driverId');
  const values = { driverId };
  if (!isUuid(vehicleId)) return { values, formError: OUT_OF_DATE_MESSAGE };
  if (!isUuid(driverId)) {
    return { values, fieldErrors: { driverId: ['Choose a driver'] } };
  }

  const failed = await createAssignment(
    { vehicleId, driverId },
    'driverId',
    values,
  );
  if (failed) return failed;

  // Outside try/catch: redirect() works by throwing.
  revalidatePath('/', 'layout');
  redirect(withFlash(`/vehicles/${vehicleId}`, 'assignment-created'));
}

/** Assigns a chosen vehicle to a driver (the driver page's form). */
export async function assignVehicleToDriver(
  driverId: string,
  _previous: AssignFormState,
  formData: FormData,
): Promise<AssignFormState> {
  const vehicleId = formText(formData, 'vehicleId');
  const values = { vehicleId };
  if (!isUuid(driverId)) return { values, formError: OUT_OF_DATE_MESSAGE };
  if (!isUuid(vehicleId)) {
    return { values, fieldErrors: { vehicleId: ['Choose a vehicle'] } };
  }

  const failed = await createAssignment(
    { vehicleId, driverId },
    'vehicleId',
    values,
  );
  if (failed) return failed;

  revalidatePath('/', 'layout');
  redirect(withFlash(`/drivers/${driverId}`, 'assignment-created'));
}

/**
 * Ends an assignment. `returnTo` picks the page to come back to; the address
 * is built here from the checked ids, never taken from the client.
 */
export async function endAssignment(
  assignmentId: string,
  vehicleId: string,
  driverId: string,
  returnTo: 'vehicle' | 'driver',
): Promise<{ error?: string }> {
  if (
    !isUuid(assignmentId) ||
    !isUuid(vehicleId) ||
    !isUuid(driverId) ||
    (returnTo !== 'vehicle' && returnTo !== 'driver')
  ) {
    return { error: OUT_OF_DATE_MESSAGE };
  }

  try {
    await sessionApiRequest<Assignment>(
      `/assignments/${encodeURIComponent(assignmentId)}/end`,
      { method: 'POST', mode: 'action' },
    );
  } catch (error) {
    const { formError } = apiErrorToFormState<never>(error, {
      fields: [],
      notFoundMessage: 'This assignment no longer exists.',
    });
    return { error: formError ?? 'The assignment could not be ended.' };
  }

  revalidatePath('/', 'layout');
  const target =
    returnTo === 'vehicle' ? `/vehicles/${vehicleId}` : `/drivers/${driverId}`;
  redirect(withFlash(target, 'assignment-ended'));
}
