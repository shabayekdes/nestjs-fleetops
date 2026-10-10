// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

vi.mock('../actions', () => ({
  loadVehicleModelOptions: vi.fn(async () => ({
    options: [{ id: 'model-1', name: 'Corolla' }],
  })),
}));

import type { VehicleFormState } from '../actions';
import { VehicleForm } from './vehicle-form';

const makes = [
  { id: 'make-1', name: 'Toyota' },
  { id: 'make-2', name: 'Ford' },
];
const vehicleTypes = [
  { id: 'type-1', name: 'Car' },
  { id: 'type-2', name: 'Van' },
];

function setup(
  action: (p: VehicleFormState, f: FormData) => Promise<VehicleFormState>,
  initialValues = {},
  extra: Partial<Parameters<typeof VehicleForm>[0]> = {},
) {
  render(
    <VehicleForm
      action={action}
      initialValues={initialValues}
      makes={makes}
      vehicleTypes={vehicleTypes}
      {...extra}
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
    for (const label of ['Make', 'Model', 'Vehicle type', 'Year', 'VIN']) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
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
    setup(
      async () => ({ values: {} }),
      {
        makeId: 'make-2',
        modelId: 'model-9',
        vehicleTypeId: 'type-2',
        licensePlate: 'AB-1',
      },
      { initialModels: [{ id: 'model-9', name: 'Transit' }] },
    );
    expect(screen.getByLabelText('Make')).toHaveValue('make-2');
    expect(screen.getByLabelText('Model')).toHaveValue('model-9');
    expect(screen.getByLabelText('Vehicle type')).toHaveValue('type-2');
    expect(screen.getByLabelText('License plate')).toHaveValue('AB-1');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/vehicles',
    );
  });

  it('starts with the Model disabled and offers the active catalog', () => {
    setup(async () => ({ values: {} }));
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(
      within(screen.getByLabelText('Vehicle type'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a vehicle type', 'Car', 'Van']);
  });

  it('keeps a retired current vehicle type selected', () => {
    setup(
      async () => ({ values: {} }),
      { makeId: 'make-1', modelId: 'model-1', vehicleTypeId: 'type-old' },
      {
        initialModels: [{ id: 'model-1', name: 'Corolla' }],
        current: {
          make: makes[0] as { id: string; name: string },
          model: { id: 'model-1', name: 'Corolla' },
          vehicleType: { id: 'type-old', name: 'Wagon' },
        },
      },
    );
    const select = screen.getByLabelText('Vehicle type');
    expect(select).toHaveValue('type-old');
    expect(within(select).getByText('Wagon (retired)')).toBeInTheDocument();
  });

  it('shows field errors with aria wiring and keeps echoed values', async () => {
    const action = vi.fn(async (_p: VehicleFormState, f: FormData) => ({
      values: {
        makeId: String(f.get('makeId')),
        vehicleTypeId: String(f.get('vehicleTypeId')),
        year: '2020',
        vin: 'IIIIIIIIIIIIIIIII',
      },
      fieldErrors: { vin: ['VIN is not valid'] },
    }));
    setup(action);
    fireEvent.change(screen.getByLabelText('Make'), {
      target: { value: 'make-1' },
    });
    fireEvent.change(screen.getByLabelText('Vehicle type'), {
      target: { value: 'type-2' },
    });
    submit();

    const vin = await screen.findByLabelText('VIN');
    await waitFor(() => expect(vin).toHaveAttribute('aria-invalid', 'true'));
    expect(vin).toHaveAccessibleDescription(/VIN is not valid/);
    expect(vin).toHaveValue('IIIIIIIIIIIIIIIII');
    expect(screen.getByLabelText('Make')).toHaveValue('make-1');
    expect(screen.getByLabelText('Vehicle type')).toHaveValue('type-2');
    expect(screen.getByLabelText('Model')).not.toHaveAttribute('aria-invalid');
  });

  it('shows a model error from the API next to the Model field', async () => {
    setup(async () => ({
      values: {},
      fieldErrors: { modelId: ['Choose a model'] },
    }));
    submit();
    const model = await screen.findByLabelText('Model');
    await waitFor(() => expect(model).toHaveAttribute('aria-invalid', 'true'));
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
