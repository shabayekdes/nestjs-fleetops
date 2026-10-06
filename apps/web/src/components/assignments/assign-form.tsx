'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FormError } from '@/components/form/form-error';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Notice } from '@/components/notice';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import type { AssignOption } from '@/lib/assignments/options';
import type { FormState } from '@/lib/forms/form-state';

type Field = 'driverId' | 'vehicleId';
type State = FormState<Field>;

type Props = {
  /** Which picker this is: the driver picker on a vehicle page, or the reverse. */
  field: Field;
  action: (previous: State, formData: FormData) => Promise<State>;
  options: AssignOption[];
  /** Shown above the picker, e.g. a license expiry warning. Never blocks submit. */
  warning?: string;
  /** More items exist than the picker lists. */
  truncated?: boolean;
  /** Shown instead of the form when there is nothing to choose. */
  emptyHint?: { text: string; href: string; linkLabel: string };
};

const COPY = {
  driverId: {
    label: 'Driver',
    placeholder: 'Choose a driver…',
    plural: 'drivers',
  },
  vehicleId: {
    label: 'Vehicle',
    placeholder: 'Choose a vehicle…',
    plural: 'vehicles',
  },
} as const;

export function AssignForm({
  field,
  action,
  options,
  warning,
  truncated,
  emptyHint,
}: Props) {
  const [state, formAction] = useActionState(action, { values: {} } as State);
  const copy = COPY[field];

  if (options.length === 0 && emptyHint) {
    return (
      <p className="text-sm">
        {emptyHint.text}{' '}
        <Link href={emptyHint.href} className="underline">
          {emptyHint.linkLabel}
        </Link>
      </p>
    );
  }

  const selected = state.values[field] ?? '';

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {warning ? <Notice variant="warning">{warning}</Notice> : null}
      <FormError message={state.formError} />
      <FormField
        name={field}
        label={copy.label}
        hint={
          truncated
            ? `Only the 100 most recently added ${copy.plural} are listed.`
            : undefined
        }
        errors={state.fieldErrors?.[field]}
      >
        {(props) => (
          <NativeSelect
            {...props}
            name={field}
            // Remount when the echoed value changes: React's form reset
            // would otherwise fall back to the placeholder.
            key={selected}
            defaultValue={selected}
          >
            <NativeSelectOption value="">{copy.placeholder}</NativeSelectOption>
            {options.map((option) => (
              <NativeSelectOption key={option.id} value={option.id}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Assign" pendingLabel="Assigning…" />
      </div>
    </form>
  );
}
