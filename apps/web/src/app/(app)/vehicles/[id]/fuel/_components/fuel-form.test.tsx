// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import type { FuelFormState } from '../actions';
import { FuelForm } from './fuel-form';

function setup(
  action: (p: FuelFormState, f: FormData) => Promise<FuelFormState>,
  initialValues = {},
) {
  render(
    <FuelForm
      action={action}
      initialValues={initialValues}
      maxDate="2026-06-16"
      submitLabel="Add fuel log"
      pendingLabel="Adding…"
      cancelHref="/vehicles/v1/fuel"
    />,
  );
}

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

describe('FuelForm', () => {
  it('sets the native constraints', () => {
    setup(async () => ({ values: {} }));
    for (const label of ['Date', 'Liters', 'Total cost']) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByLabelText('Odometer (km)')).not.toBeRequired();
    const date = screen.getByLabelText('Date');
    expect(date).toHaveAttribute('type', 'date');
    expect(date).toHaveAttribute('max', '2026-06-16');
    expect(screen.getByLabelText('Liters')).toHaveAttribute(
      'inputmode',
      'decimal',
    );
    expect(screen.getByLabelText('Total cost')).toHaveAttribute(
      'inputmode',
      'decimal',
    );
    const odometer = screen.getByLabelText('Odometer (km)');
    expect(odometer).toHaveAttribute('type', 'number');
    expect(odometer).toHaveAttribute('min', '0');
    expect(odometer).toHaveAttribute('max', '9999999');
  });

  it('fills the initial values and links Cancel', () => {
    setup(async () => ({ values: {} }), {
      fueledOn: '2026-01-15',
      liters: '45.500',
      totalCost: '80.00',
      odometerKm: '1000',
    });
    expect(screen.getByLabelText('Liters')).toHaveValue('45.500');
    expect(screen.getByLabelText('Odometer (km)')).toHaveValue(1000);
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/vehicles/v1/fuel',
    );
  });

  it('shows field errors with aria wiring and keeps echoed values', async () => {
    const action = vi.fn(async (_p: FuelFormState, f: FormData) => ({
      values: { liters: String(f.get('liters')), totalCost: '80.00' },
      fieldErrors: { liters: ['Enter more than 0 liters'] },
    }));
    setup(action);
    fireEvent.change(screen.getByLabelText('Liters'), {
      target: { value: '0' },
    });
    submit();
    const liters = await screen.findByLabelText('Liters');
    await waitFor(() => expect(liters).toHaveAttribute('aria-invalid', 'true'));
    expect(liters).toHaveAccessibleDescription(/Enter more than 0 liters/);
    expect(liters).toHaveValue('0');
    expect(screen.getByLabelText('Total cost')).toHaveValue('80.00');
    expect(screen.getByLabelText('Total cost')).not.toHaveAttribute(
      'aria-invalid',
    );
  });

  it('shows a form-level error as an alert', async () => {
    setup(async () => ({ values: {}, formError: 'Something is off' }));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something is off',
    );
  });

  it('disables submit once the session has expired', () => {
    session.current = { kind: 'expired' };
    setup(async () => ({ values: {} }));
    expect(screen.getByRole('button', { name: 'Add fuel log' })).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
