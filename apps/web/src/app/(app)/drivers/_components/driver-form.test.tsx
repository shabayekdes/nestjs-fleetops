// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => ({ kind: 'none' }),
}));

import type { DriverFormState } from '../actions';
import { DriverForm } from './driver-form';

function setup(
  action: (p: DriverFormState, f: FormData) => Promise<DriverFormState>,
  extra: Partial<Parameters<typeof DriverForm>[0]> = {},
) {
  render(
    <DriverForm
      action={action}
      initialValues={{}}
      submitLabel="Create driver"
      pendingLabel="Creating…"
      cancelHref="/drivers"
      {...extra}
    />,
  );
}

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

describe('DriverForm', () => {
  it('sets the native constraints', () => {
    setup(async () => ({ values: {} }));
    for (const label of [
      'First name',
      'Last name',
      'License number',
      'License expires on',
    ]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    const license = screen.getByLabelText('License number');
    expect(license).toHaveAttribute('maxlength', '30');
    expect(license).toHaveAttribute('autocapitalize', 'characters');
    expect(license).toHaveClass('font-mono');
    expect(screen.getByLabelText('License expires on')).toHaveAttribute(
      'type',
      'date',
    );
    expect(screen.getByText('Valid through this date (UTC).')).toBeVisible();
  });

  it('renders the account select only when options are passed', () => {
    setup(async () => ({ values: {} }));
    expect(screen.queryByLabelText('Login account')).toBeNull();
  });

  it('renders the account select with Not linked first and the hints', () => {
    setup(async () => ({ values: {} }), {
      userOptions: [{ id: 'u1', label: 'Sam Driver (sam@x.test) — Driver' }],
      usersTruncated: true,
    });
    const select = screen.getByLabelText('Login account');
    expect(select).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'Not linked' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Sam Driver (sam@x.test) — Driver' }),
    ).toBeInTheDocument();
    expect(select).toHaveAccessibleDescription(
      /A user can be linked to one driver only\. Only the 100 most recently added users are listed\./,
    );
  });

  it('preselects the initial account', () => {
    setup(async () => ({ values: {} }), {
      initialValues: { userId: 'u1' },
      userOptions: [{ id: 'u1', label: 'Current linked account' }],
    });
    expect(screen.getByLabelText('Login account')).toHaveValue('u1');
  });

  it('echoes values and wires errors with aria-describedby', async () => {
    const action = vi.fn(
      async (_p: DriverFormState, fd: FormData): Promise<DriverFormState> => ({
        values: {
          firstName: String(fd.get('firstName')),
          licenseNumber: String(fd.get('licenseNumber')),
        },
        fieldErrors: { licenseNumber: ['bad license'] },
        formError: 'A driver with this license number already exists',
      }),
    );
    setup(action);
    fireEvent.change(screen.getByLabelText('First name'), {
      target: { value: 'Ada' },
    });
    fireEvent.change(screen.getByLabelText('License number'), {
      target: { value: 'ab-1' },
    });
    submit();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A driver with this license number already exists',
      ),
    );
    expect(screen.getByLabelText('First name')).toHaveValue('Ada');
    const license = screen.getByLabelText('License number');
    expect(license).toHaveValue('ab-1');
    expect(license).toHaveAttribute('aria-invalid', 'true');
    expect(license.getAttribute('aria-describedby')).toContain(
      'licenseNumber-error',
    );
    expect(screen.getByText('bad license')).toHaveAttribute(
      'id',
      'licenseNumber-error',
    );
  });
});
