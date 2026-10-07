// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import type { MaintenanceFormState } from '../actions';
import { MaintenanceForm } from './maintenance-form';

function setup(
  action: (
    p: MaintenanceFormState,
    f: FormData,
  ) => Promise<MaintenanceFormState>,
  initialValues = {},
) {
  render(
    <MaintenanceForm
      action={action}
      initialValues={initialValues}
      maxDate="2026-06-16"
      submitLabel="Add record"
      pendingLabel="Adding…"
      cancelHref="/vehicles/v1/maintenance"
    />,
  );
}

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

describe('MaintenanceForm', () => {
  it('sets the native constraints', () => {
    setup(async () => ({ values: {} }));
    for (const label of ['Type', 'Date performed', 'Cost']) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    for (const label of [
      'Odometer (km)',
      'Vendor',
      'Description',
      'Next service due',
    ]) {
      expect(screen.getByLabelText(label)).not.toBeRequired();
    }
    const date = screen.getByLabelText('Date performed');
    expect(date).toHaveAttribute('type', 'date');
    expect(date).toHaveAttribute('max', '2026-06-16');
    const cost = screen.getByLabelText('Cost');
    expect(cost).toHaveAttribute('inputmode', 'decimal');
    const odometer = screen.getByLabelText('Odometer (km)');
    expect(odometer).toHaveAttribute('type', 'number');
    expect(odometer).toHaveAttribute('min', '0');
    expect(odometer).toHaveAttribute('max', '9999999');
    expect(odometer).toHaveAttribute('step', '1');
    expect(screen.getByLabelText('Vendor')).toHaveAttribute('maxlength', '100');
    const description = screen.getByLabelText('Description');
    expect(description.tagName).toBe('TEXTAREA');
    expect(description).toHaveAttribute('maxlength', '500');
    expect(
      screen.getByLabelText('Next service due'),
    ).toHaveAccessibleDescription(
      "Sets the vehicle's next service date and status",
    );
  });

  it('offers a placeholder and the six types in words', () => {
    setup(async () => ({ values: {} }));
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      'Choose a type',
      'Oil change',
      'Tires',
      'Brakes',
      'Inspection',
      'Repair',
      'Other',
    ]);
    expect(screen.getByLabelText('Type')).toHaveValue('');
  });

  it('fills the initial values and links Cancel', () => {
    setup(async () => ({ values: {} }), {
      type: 'BRAKES',
      performedOn: '2026-01-15',
      cost: '89.90',
      description: 'Pads',
    });
    expect(screen.getByLabelText('Type')).toHaveValue('BRAKES');
    expect(screen.getByLabelText('Date performed')).toHaveValue('2026-01-15');
    expect(screen.getByLabelText('Cost')).toHaveValue('89.90');
    expect(screen.getByLabelText('Description')).toHaveValue('Pads');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/vehicles/v1/maintenance',
    );
  });

  it('shows field errors with aria wiring and keeps echoed values', async () => {
    const action = vi.fn(async (_p: MaintenanceFormState, f: FormData) => ({
      values: {
        type: 'TIRES',
        performedOn: '2026-01-15',
        cost: String(f.get('cost')),
      },
      fieldErrors: { cost: ['Enter an amount such as 89.90'] },
    }));
    setup(action);
    fireEvent.change(screen.getByLabelText('Cost'), {
      target: { value: 'abc' },
    });
    submit();

    const cost = await screen.findByLabelText('Cost');
    await waitFor(() => expect(cost).toHaveAttribute('aria-invalid', 'true'));
    expect(cost).toHaveAccessibleDescription(/Enter an amount such as 89.90/);
    expect(cost).toHaveValue('abc');
    expect(screen.getByLabelText('Type')).toHaveValue('TIRES');
    expect(screen.getByLabelText('Vendor')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a form-level error as an alert', async () => {
    setup(async () => ({
      values: {},
      formError: 'nextServiceDueOn must be after performedOn',
    }));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'nextServiceDueOn must be after performedOn',
    );
  });

  it('shows the pending label while submitting', async () => {
    let resolve: (s: MaintenanceFormState) => void = () => {};
    setup(() => new Promise((r) => (resolve = r)));
    submit();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled(),
    );
    resolve({ values: {} });
    expect(
      await screen.findByRole('button', { name: 'Add record' }),
    ).toBeEnabled();
  });

  it('disables submit once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup(async () => ({ values: {} }));
    expect(screen.getByRole('button', { name: 'Add record' })).toBeDisabled();
    expect(screen.getByText(/session has expired/)).toBeInTheDocument();
    session.current = { kind: 'none' };
  });
});
