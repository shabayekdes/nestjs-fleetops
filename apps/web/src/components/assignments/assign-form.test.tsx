// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({
  current: { kind: 'none' } as { kind: string },
}));
vi.mock('@/components/session-deadline', () => ({
  useSessionStatus: () => session.current,
}));

import { AssignForm } from './assign-form';

type State = Parameters<Parameters<typeof AssignForm>[0]['action']>[0];

const options = [
  { id: 'd1', label: 'Sam Driver (LIC-1)' },
  { id: 'd2', label: 'Jordan Lee (LIC-2) — license expired' },
];

function submit() {
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

describe('AssignForm', () => {
  it('lists the options after a placeholder and labels the select', () => {
    render(
      <AssignForm
        field="driverId"
        action={async () => ({ values: {} })}
        options={options}
      />,
    );
    const select = screen.getByLabelText('Driver');
    expect(select).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'Choose a driver…' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Jordan Lee (LIC-2) — license expired',
      }),
    ).toBeInTheDocument();
  });

  it('shows the warning and keeps submit enabled', () => {
    render(
      <AssignForm
        field="vehicleId"
        action={async () => ({ values: {} })}
        options={[{ id: 'v1', label: 'Ford Transit (AB-1)' }]}
        warning="This driver's license expired on Jan 1, 2020."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "This driver's license expired on Jan 1, 2020.",
    );
    expect(screen.getByRole('button', { name: 'Assign' })).toBeEnabled();
    expect(screen.getByLabelText('Vehicle')).toBeInTheDocument();
  });

  it('shows the truncated hint', () => {
    render(
      <AssignForm
        field="driverId"
        action={async () => ({ values: {} })}
        options={options}
        truncated
      />,
    );
    expect(
      screen.getByText('Only the 100 most recently added drivers are listed.'),
    ).toBeInTheDocument();
  });

  it('shows the empty hint with its link instead of the form', () => {
    render(
      <AssignForm
        field="driverId"
        action={async () => ({ values: {} })}
        options={[]}
        emptyHint={{
          text: 'No drivers yet.',
          href: '/drivers/new',
          linkLabel: 'Add a driver',
        }}
      />,
    );
    expect(screen.getByText(/No drivers yet\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a driver' })).toHaveAttribute(
      'href',
      '/drivers/new',
    );
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });

  it('shows the API error and the field error and echoes the choice', async () => {
    const action = vi.fn(async (_p: State, fd: FormData): Promise<State> => ({
      values: { driverId: String(fd.get('driverId')) },
      formError: 'Driver license has expired',
      fieldErrors: { driverId: ['Choose a driver'] },
    }));
    render(<AssignForm field="driverId" action={action} options={options} />);
    fireEvent.change(screen.getByLabelText('Driver'), {
      target: { value: 'd2' },
    });
    submit();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Driver license has expired',
      ),
    );
    expect(screen.getByLabelText('Driver')).toHaveValue('d2');
    expect(screen.getByLabelText('Driver')).toHaveAttribute(
      'aria-describedby',
      'driverId-error',
    );
    expect(screen.getByText('Choose a driver')).toHaveAttribute(
      'id',
      'driverId-error',
    );
  });

  it('is disabled once the session has expired', () => {
    session.current = { kind: 'expired' };
    render(
      <AssignForm
        field="driverId"
        action={async () => ({ values: {} })}
        options={options}
      />,
    );
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
    session.current = { kind: 'none' };
  });
});
