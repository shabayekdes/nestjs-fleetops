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

import { MaintenanceFilters } from './maintenance-filters';

describe('MaintenanceFilters', () => {
  it('shows the current filters and a GET form to the list', () => {
    render(
      <MaintenanceFilters
        vehicleId="v1"
        query={{
          page: 1,
          limit: 20,
          type: 'BRAKES',
          from: '2026-01-01',
          to: '2026-02-01',
        }}
      />,
    );
    const form = screen.getByRole('form', {
      name: 'Filter maintenance records',
    });
    expect(form).toHaveAttribute('action', '/vehicles/v1/maintenance');
    expect(screen.getByLabelText('Type')).toHaveValue('BRAKES');
    expect(screen.getByLabelText('From')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-02-01');
    expect(form.querySelector('input[name="limit"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/vehicles/v1/maintenance',
    );
  });

  it('keeps a non-default limit', () => {
    render(<MaintenanceFilters vehicleId="v1" query={{ page: 1, limit: 5 }} />);
    expect(document.querySelector('input[name="limit"]')).toHaveValue('5');
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/vehicles/v1/maintenance?limit=5',
    );
    expect(screen.getByLabelText('Type')).toHaveValue('');
  });
});
