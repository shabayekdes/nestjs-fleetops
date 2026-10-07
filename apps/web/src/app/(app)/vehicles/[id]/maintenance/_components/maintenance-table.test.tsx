// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MaintenanceRecord } from '@/lib/api/types';

vi.mock('../actions', () => ({ deleteMaintenanceRecord: vi.fn() }));

import { MaintenanceTable } from './maintenance-table';

const base: MaintenanceRecord = {
  id: 'r1',
  vehicleId: 'v1',
  type: 'OIL_CHANGE',
  description: 'New filter',
  vendor: 'Quick Lube',
  performedOn: '2026-01-15',
  odometerKm: 120000,
  cost: '1234.50',
  nextServiceDueOn: '2026-07-15',
  createdAt: '2026-01-15T00:00:00.000Z',
  updatedAt: '2026-01-15T00:00:00.000Z',
};

describe('MaintenanceTable', () => {
  it('formats the row and links Edit', () => {
    render(<MaintenanceTable vehicleId="v1" records={[base]} />);
    const row = screen.getAllByRole('row')[1] as HTMLElement;
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent);
    expect(cells.slice(0, 7)).toEqual([
      'Jan 15, 2026',
      'Oil change',
      'New filter',
      'Quick Lube',
      '120,000 km',
      '1,234.50',
      'Jul 15, 2026',
    ]);
    expect(screen.getByText('1,234.50')).toHaveClass(
      'tabular-nums',
      'text-right',
    );
    expect(
      screen.getByRole('link', { name: /Edit Oil change on Jan 15, 2026/ }),
    ).toHaveAttribute('href', '/vehicles/v1/maintenance/r1/edit');
    expect(
      screen.getByRole('button', { name: /Delete Oil change on Jan 15, 2026/ }),
    ).toBeInTheDocument();
  });

  it('shows dashes for missing optional values', () => {
    render(
      <MaintenanceTable
        vehicleId="v1"
        records={[
          {
            ...base,
            description: null,
            vendor: null,
            odometerKm: null,
            nextServiceDueOn: null,
          },
        ]}
      />,
    );
    expect(screen.getAllByText('—')).toHaveLength(4);
  });
});
