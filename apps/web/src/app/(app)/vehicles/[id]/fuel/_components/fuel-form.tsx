'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormError } from '@/components/form/form-error';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FormState } from '@/lib/forms/form-state';
import type { FuelField, FuelFormValues } from '../_lib/fuel-schema';

type State = FormState<FuelField>;

type Props = {
  action: (previous: State, formData: FormData) => Promise<State>;
  initialValues: FuelFormValues;
  /** The latest date a fill-up can be recorded for (tomorrow, UTC). */
  maxDate: string;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
};

export function FuelForm({
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
  function value(field: FuelField): string {
    return state.values[field] ?? initialValues[field] ?? '';
  }

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <FormError message={state.formError} />

      <FormField
        name="fueledOn"
        label="Date"
        errors={state.fieldErrors?.fueledOn}
      >
        {(props) => (
          <Input
            {...props}
            name="fueledOn"
            type="date"
            required
            min="1900-01-01"
            max={maxDate}
            defaultValue={value('fueledOn')}
          />
        )}
      </FormField>

      <FormField
        name="liters"
        label="Liters"
        hint="An amount such as 45.500"
        errors={state.fieldErrors?.liters}
      >
        {(props) => (
          <Input
            {...props}
            name="liters"
            inputMode="decimal"
            required
            autoComplete="off"
            className="w-40"
            defaultValue={value('liters')}
          />
        )}
      </FormField>

      <FormField
        name="totalCost"
        label="Total cost"
        hint="An amount such as 80.00"
        errors={state.fieldErrors?.totalCost}
      >
        {(props) => (
          <Input
            {...props}
            name="totalCost"
            inputMode="decimal"
            required
            autoComplete="off"
            className="w-40"
            defaultValue={value('totalCost')}
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

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
