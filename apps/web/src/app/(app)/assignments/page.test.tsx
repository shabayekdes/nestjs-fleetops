// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

const listAssignments = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());
vi.mock('@/lib/assignments/assignments-api', () => ({ listAssignments }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser }));
vi.mock('@/components/refresh-on-mount', () => ({
  RefreshOnMount: () => null,
}));
vi.mock('next/form', () => ({
  default: ({
    action,
    children,
    ...rest
  }: {
    action: string;
    children: ReactNode;
  }) => (
    <form action={action} {...rest}>
      {children}
    </form>
  ),
}));

import AssignmentsPage from './page';

function assignment(n: number, endedAt: string | null) {
  return {
    id: `a${n}`,
    startedAt: '2026-01-05T08:00:00.000Z',
    endedAt,
    vehicle: {
      id: `v${n}`,
      make: `Make${n}`,
      model: 'Transit',
      vin: `VIN${n}`,
      licensePlate: `PLATE${n}`,
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

function apiError(status: number) {
  return new ApiError({
    status,
    error: 'E',
    message: 'm',
    fieldErrors: {},
    requestId: 'req-1',
    path: '/p',
    body: undefined,
  });
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    await AssignmentsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ role: 'MANAGER' });
  listAssignments.mockReset();
  listAssignments.mockResolvedValue({
    data: [assignment(1, null), assignment(2, '2026-02-01T09:30:00.000Z')],
    meta: { page: 1, limit: 20, total: 2 },
  });
});

describe('AssignmentsPage', () => {
  it('renders rows with links, a Current badge and the ended date', async () => {
    await renderPage();
    expect(screen.getByRole('link', { name: 'Make1 Transit' })).toHaveAttribute(
      'href',
      '/vehicles/v1',
    );
    expect(screen.getByRole('link', { name: 'First2 Driver' })).toHaveAttribute(
      'href',
      '/drivers/d2',
    );
    expect(
      within(screen.getByRole('table')).getByText('Current'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Feb 1, 2026/)).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('');
  });

  it('shows NotAllowed to a driver without fetching', async () => {
    getCurrentUser.mockResolvedValue({ role: 'DRIVER' });
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(listAssignments).not.toHaveBeenCalled();
  });

  it('parses active and sends it to the API', async () => {
    await renderPage({ active: 'false', page: '2', notice: 'x' });
    expect(listAssignments).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      active: false,
    });
    expect(screen.getByLabelText('Status')).toHaveValue('false');
  });

  it('ignores an invalid active value and warns', async () => {
    await renderPage({ active: 'maybe' });
    expect(listAssignments).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByRole('alert')).toHaveTextContent(/were not valid/);
  });

  it('shows the three empty states', async () => {
    listAssignments.mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
    await renderPage();
    expect(screen.getByText('No assignments yet')).toBeInTheDocument();
    expect(
      screen.getByText('Assign a driver from a vehicle or driver page.'),
    ).toBeInTheDocument();
    document.body.innerHTML = '';

    await renderPage({ active: 'true' });
    expect(
      screen.getByText('No assignments match this filter'),
    ).toBeInTheDocument();
    document.body.innerHTML = '';

    listAssignments.mockResolvedValue({
      data: [],
      meta: { page: 9, limit: 20, total: 45 },
    });
    await renderPage({ page: '9' });
    expect(screen.getByText('No assignments on this page')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the last page' }),
    ).toHaveAttribute('href', '/assignments?page=3');
  });

  it('shows the filter error on a 400', async () => {
    listAssignments.mockRejectedValue(apiError(400));
    await renderPage();
    expect(
      screen.getByText('These filters could not be applied'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/assignments',
    );
  });

  it('shows NotAllowed on a 403 and rethrows other errors', async () => {
    listAssignments.mockRejectedValueOnce(apiError(403));
    await renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    listAssignments.mockRejectedValueOnce(apiError(500));
    await expect(renderPage()).rejects.toBeInstanceOf(ApiError);
  });
});
