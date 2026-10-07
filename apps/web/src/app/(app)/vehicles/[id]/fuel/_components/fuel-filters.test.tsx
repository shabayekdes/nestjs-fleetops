// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

import { FuelFilters } from './fuel-filters';

describe('FuelFilters', () => {
  it('shows the current range and a GET form to the list', () => {
    render(
      <FuelFilters
        vehicleId="v1"
        query={{ page: 1, limit: 5, from: '2026-01-01' }}
      />,
    );
    expect(
      screen.getByRole('form', { name: 'Filter fuel logs' }),
    ).toHaveAttribute('action', '/vehicles/v1/fuel');
    expect(screen.getByLabelText('From')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('To')).toHaveValue('');
    expect(document.querySelector('input[name="limit"]')).toHaveValue('5');
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/vehicles/v1/fuel?limit=5',
    );
  });

  it('resets the date fields when the query changes', () => {
    const { rerender } = render(
      <FuelFilters
        vehicleId="v1"
        query={{ page: 1, limit: 10, from: '2026-01-01', to: '2026-02-01' }}
      />,
    );
    expect(screen.getByLabelText('To')).toHaveValue('2026-02-01');
    rerender(<FuelFilters vehicleId="v1" query={{ page: 1, limit: 10 }} />);
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(screen.getByLabelText('To')).toHaveValue('');
  });
});
