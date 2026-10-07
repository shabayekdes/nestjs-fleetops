// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FuelLog } from '@/lib/api/types';

vi.mock('../actions', () => ({ deleteFuelLog: vi.fn() }));

import { FuelTable } from './fuel-table';

const base: FuelLog = {
  id: 'f1',
  vehicleId: 'v1',
  fueledOn: '2026-01-15',
  liters: '1234.500',
  totalCost: '2000.00',
  odometerKm: 120000,
  createdAt: '',
  updatedAt: '',
};

describe('FuelTable', () => {
  it('formats the row and links Edit', () => {
    render(<FuelTable vehicleId="v1" logs={[base]} />);
    const row = screen.getAllByRole('row')[1] as HTMLElement;
    const cells = within(row)
      .getAllByRole('cell')
      .map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual([
      'Jan 15, 2026',
      '1,234.500',
      '2,000.00',
      '120,000 km',
    ]);
    expect(screen.getByText('2,000.00')).toHaveClass(
      'tabular-nums',
      'text-right',
    );
    expect(
      screen.getByRole('link', { name: /Edit Fuel log of Jan 15, 2026/ }),
    ).toHaveAttribute('href', '/vehicles/v1/fuel/f1/edit');
  });

  it('shows a dash without an odometer', () => {
    render(<FuelTable vehicleId="v1" logs={[{ ...base, odometerKm: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
