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
import { Textarea } from '@/components/ui/textarea';
import type { FormState } from '@/lib/forms/form-state';
import type {
  MaintenanceField,
  MaintenanceFormValues,
} from '../_lib/maintenance-schema';
import {
  MAINTENANCE_TYPES,
  MAINTENANCE_TYPE_LABELS,
} from '../_lib/maintenance-types';

type State = FormState<MaintenanceField>;

type Props = {
  action: (previous: State, formData: FormData) => Promise<State>;
  initialValues: MaintenanceFormValues;
  /** The latest date a service can be recorded for (tomorrow, UTC). */
  maxDate: string;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function MaintenanceForm({
  action,
  initialValues,
  maxDate,
  submitLabel,
  pendingLabel,
  cancelHref,
}: Props) {
  const [state, formAction] = useActionState(action, { values: {} } as State);

  // React resets the form after an action, so defaults come from the echoed
  // values first and the initial values second.
  function value(field: MaintenanceField): string {
    return state.values[field] ?? initialValues[field] ?? '';
  }

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <FormError message={state.formError} />

      <FormField name="type" label="Type" errors={state.fieldErrors?.type}>
        {(props) => (
          <NativeSelect
            {...props}
            name="type"
            // Remount when the echoed value changes: React's form reset
            // would otherwise fall back to the first option.
            key={value('type')}
            required
            defaultValue={value('type')}
          >
            <NativeSelectOption value="">Choose a type</NativeSelectOption>
            {MAINTENANCE_TYPES.map((type) => (
              <NativeSelectOption key={type} value={type}>
                {MAINTENANCE_TYPE_LABELS[type]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <FormField
        name="performedOn"
        label="Date performed"
        errors={state.fieldErrors?.performedOn}
      >
        {(props) => (
          <Input
            {...props}
            name="performedOn"
            type="date"
            required
            min="1900-01-01"
            max={maxDate}
            defaultValue={value('performedOn')}
          />
        )}
      </FormField>

      <FormField
        name="cost"
        label="Cost"
        hint="An amount such as 89.90"
        errors={state.fieldErrors?.cost}
      >
        {(props) => (
          <Input
            {...props}
            name="cost"
            inputMode="decimal"
            required
            autoComplete="off"
            className="w-40"
            defaultValue={value('cost')}
          />
        )}
      </FormField>

      <FormField
        name="odometerKm"
        label="Odometer (km)"
        errors={state.fieldErrors?.odometerKm}
      >
        {(props) => (
          <Input
            {...props}
            name="odometerKm"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999999}
            step={1}
            className="w-40"
            defaultValue={value('odometerKm')}
          />
        )}
      </FormField>

      <FormField
        name="vendor"
        label="Vendor"
        errors={state.fieldErrors?.vendor}
      >
        {(props) => (
          <Input
            {...props}
            name="vendor"
            maxLength={100}
            defaultValue={value('vendor')}
          />
        )}
      </FormField>

      <FormField
        name="description"
        label="Description"
        errors={state.fieldErrors?.description}
      >
        {(props) => (
          <Textarea
            {...props}
            name="description"
            maxLength={500}
            rows={3}
            defaultValue={value('description')}
          />
        )}
      </FormField>

      <FormField
        name="nextServiceDueOn"
        label="Next service due"
        hint="Sets the vehicle's next service date and status"
        errors={state.fieldErrors?.nextServiceDueOn}
      >
        {(props) => (
          <Input
            {...props}
            name="nextServiceDueOn"
            type="date"
            defaultValue={value('nextServiceDueOn')}
          />
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
