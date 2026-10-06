'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormError } from '@/components/form/form-error';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/lib/forms/form-state';
import type { VehicleField, VehicleFormValues } from '../_lib/vehicle-schema';

type State = FormState<VehicleField>;

type Props = {
  action: (previous: State, formData: FormData) => Promise<State>;
  initialValues: VehicleFormValues;
  maxYear: number;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function VehicleForm({
  action,
  initialValues,
  maxYear,
  submitLabel,
  pendingLabel,
  cancelHref,
}: Props) {
  const [state, formAction] = useActionState(action, { values: {} } as State);

  // React resets the form after an action, so defaults come from the echoed
  // values first and the initial values second.
  function value(field: VehicleField): string {
    return state.values[field] ?? initialValues[field] ?? '';
  }

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <FormError message={state.formError} />

      <FormField name="make" label="Make" errors={state.fieldErrors?.make}>
        {(props) => (
          <Input
            {...props}
            name="make"
            required
            maxLength={50}
            defaultValue={value('make')}
          />
        )}
      </FormField>

      <FormField name="model" label="Model" errors={state.fieldErrors?.model}>
        {(props) => (
          <Input
            {...props}
            name="model"
            required
            maxLength={50}
            defaultValue={value('model')}
          />
        )}
      </FormField>

      <FormField name="year" label="Year" errors={state.fieldErrors?.year}>
        {(props) => (
          <Input
            {...props}
            name="year"
            type="number"
            inputMode="numeric"
            required
            min={1900}
            max={maxYear}
            step={1}
            defaultValue={value('year')}
          />
        )}
      </FormField>

      <FormField
        name="vin"
        label="VIN"
        hint="17 characters. Letters I, O and Q are not used."
        errors={state.fieldErrors?.vin}
      >
        {(props) => (
          <Input
            {...props}
            name="vin"
            required
            minLength={17}
            maxLength={17}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            defaultValue={value('vin')}
          />
        )}
      </FormField>

      <FormField
        name="licensePlate"
        label="License plate"
        hint="Leave empty if the vehicle is not registered yet."
        errors={state.fieldErrors?.licensePlate}
      >
        {(props) => (
          <Input
            {...props}
            name="licensePlate"
            maxLength={15}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            defaultValue={value('licensePlate')}
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
