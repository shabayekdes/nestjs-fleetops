// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import type { VehicleFormState } from '../actions';
import { VehicleForm } from './vehicle-form';

function setup(
  action: (p: VehicleFormState, f: FormData) => Promise<VehicleFormState>,
  initialValues = {},
) {
  render(
    <VehicleForm
      action={action}
      initialValues={initialValues}
      maxYear={2027}
      submitLabel="Create vehicle"
      pendingLabel="Creating…"
      cancelHref="/vehicles"
    />,
  );
}

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

describe('VehicleForm', () => {
  it('sets the native constraints', () => {
    setup(async () => ({ values: {} }));
    for (const label of ['Make', 'Model', 'Year', 'VIN']) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByLabelText('Make')).toHaveAttribute('maxlength', '50');
    const vin = screen.getByLabelText('VIN');
    expect(vin).toHaveAttribute('minlength', '17');
    expect(vin).toHaveAttribute('maxlength', '17');
    expect(vin).toHaveAttribute('autocapitalize', 'characters');
    const year = screen.getByLabelText('Year');
    expect(year).toHaveAttribute('type', 'number');
    expect(year).toHaveAttribute('min', '1900');
    expect(year).toHaveAttribute('max', '2027');
    const plate = screen.getByLabelText('License plate');
    expect(plate).not.toBeRequired();
    expect(plate).toHaveAttribute('maxlength', '15');
    expect(plate).toHaveAccessibleDescription(
      'Leave empty if the vehicle is not registered yet.',
    );
  });

  it('fills the initial values and links Cancel', () => {
    setup(async () => ({ values: {} }), { make: 'Ford', licensePlate: 'AB-1' });
    expect(screen.getByLabelText('Make')).toHaveValue('Ford');
    expect(screen.getByLabelText('License plate')).toHaveValue('AB-1');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/vehicles',
    );
  });

  it('shows field errors with aria wiring and keeps echoed values', async () => {
    const action = vi.fn(async (_p: VehicleFormState, f: FormData) => ({
      values: {
        make: String(f.get('make')),
        model: 'M',
        year: '2020',
        vin: 'IIIIIIIIIIIIIIIII',
      },
      fieldErrors: { vin: ['VIN is not valid'] },
    }));
    setup(action);
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'Ford' },
    });
    submit();

    const vin = await screen.findByLabelText('VIN');
    await waitFor(() => expect(vin).toHaveAttribute('aria-invalid', 'true'));
    expect(vin).toHaveAccessibleDescription(/VIN is not valid/);
    expect(vin).toHaveValue('IIIIIIIIIIIIIIIII');
    expect(screen.getByLabelText('Make')).toHaveValue('Ford');
    expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a form-level error as an alert', async () => {
    setup(async () => ({
      values: {},
      formError: 'A vehicle with this VIN already exists',
    }));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A vehicle with this VIN already exists',
    );
  });

  it('shows the pending label while submitting', async () => {
    let resolve: (s: VehicleFormState) => void = () => {};
    setup(() => new Promise((r) => (resolve = r)));
    submit();
    // Query again on every retry: the button node may be replaced.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled(),
    );
    resolve({ values: {} });
    expect(
      await screen.findByRole('button', { name: 'Create vehicle' }),
    ).toBeEnabled();
  });

  it('disables submit once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup(async () => ({ values: {} }));
    expect(
      screen.getByRole('button', { name: 'Create vehicle' }),
    ).toBeDisabled();
    expect(screen.getByText(/session has expired/)).toBeInTheDocument();
    session.current = { kind: 'none' };
  });
});
