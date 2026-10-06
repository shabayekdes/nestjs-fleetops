// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Assignment } from '@/lib/api/types';
import type { AssignmentSectionData } from '@/lib/assignments/assignments-api';

vi.mock('@/lib/assignments/actions', () => ({ endAssignment: vi.fn() }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));

import { AssignmentSection } from './assignment-section';

function assignment(n: number, endedAt: string | null): Assignment {
  return {
    id: `a${n}`,
    startedAt: '2026-01-05T08:00:00.000Z',
    endedAt,
    vehicle: {
      id: `v${n}`,
      make: `Make${n}`,
      model: 'Transit',
      vin: `VIN${n}`,
      licensePlate: n % 2 ? `PLATE${n}` : null,
    },
    driver: {
      id: `d${n}`,
      firstName: `First${n}`,
      lastName: 'Driver',
      licenseNumber: `LIC-${n}`,
    },
    createdAt: '2026-01-05T08:00:00.000Z',
    updatedAt: '2026-01-05T08:00:00.000Z',
  };
}

const noPast = { data: [], meta: { page: 1, limit: 10, total: 0 } };

function setup(
  data: AssignmentSectionData,
  perspective: 'vehicle' | 'driver' = 'vehicle',
) {
  render(
    <AssignmentSection
      perspective={perspective}
      data={data}
      pathname="/vehicles/v1"
      assignAction={async () => ({ values: {} })}
      options={[{ id: 'x', label: 'Option X' }]}
    />,
  );
}

describe('AssignmentSection', () => {
  it('shows the current driver, the End button and the hint, without the form', () => {
    setup({ kind: 'ok', current: assignment(1, null), past: noPast });
    expect(
      screen.getByRole('heading', { name: 'Assignment' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'First1 Driver' })).toHaveAttribute(
      'href',
      '/drivers/d1',
    );
    expect(screen.getByText(/Since Jan 5, 2026/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'End assignment' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('End the current assignment to assign another driver.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });

  it('shows the current vehicle on a driver page', () => {
    setup({ kind: 'ok', current: assignment(1, null), past: noPast }, 'driver');
    expect(screen.getByRole('link', { name: 'Make1 Transit' })).toHaveAttribute(
      'href',
      '/vehicles/v1',
    );
    expect(
      screen.getByText('End the current assignment to assign another vehicle.'),
    ).toBeInTheDocument();
  });

  it('shows the assign form when nothing is current', () => {
    setup({ kind: 'ok', current: null, past: noPast });
    expect(screen.getByText('No driver assigned.')).toBeInTheDocument();
    expect(screen.getByLabelText('Driver')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeInTheDocument();
    expect(screen.getByText('No past assignments.')).toBeInTheDocument();
  });

  it('says "No vehicle assigned." on a driver page', () => {
    setup({ kind: 'ok', current: null, past: noPast }, 'driver');
    expect(screen.getByText('No vehicle assigned.')).toBeInTheDocument();
  });

  it('shows the past assignments table with started and ended dates', () => {
    setup({
      kind: 'ok',
      current: null,
      past: {
        data: [assignment(2, '2026-02-01T09:30:00.000Z')],
        meta: { page: 1, limit: 10, total: 1 },
      },
    });
    const table = screen.getByRole('table', { name: 'Past assignments' });
    expect(table).toHaveTextContent('First2 Driver');
    expect(table).toHaveTextContent('Jan 5, 2026');
    expect(table).toHaveTextContent('Feb 1, 2026');
  });

  it('paginates the history with its own page param', () => {
    setup({
      kind: 'ok',
      current: null,
      past: {
        data: [assignment(2, '2026-02-01T09:30:00.000Z')],
        meta: { page: 1, limit: 10, total: 25 },
      },
    });
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/vehicles/v1?assignmentsPage=2',
    );
  });

  it('shows the past-the-end state with a link to the last page', () => {
    setup({
      kind: 'ok',
      current: null,
      past: { data: [], meta: { page: 99, limit: 10, total: 25 } },
    });
    expect(screen.getByText('No assignments on this page')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', '/vehicles/v1?assignmentsPage=3');
  });

  it('shows an inline NotAllowed when forbidden', () => {
    setup({ kind: 'forbidden' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(
      screen.getByRole('heading', { name: 'Assignment' }),
    ).toBeInTheDocument();
  });
});
