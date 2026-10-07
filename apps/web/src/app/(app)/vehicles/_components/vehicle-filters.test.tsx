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

import { VehicleFilters } from './vehicle-filters';
describe('VehicleFilters', () => {
  it('resets text, number and select fields when the query changes', () => {
    const { rerender } = render(
      <VehicleFilters
        maxYear={2030}
        query={{
          page: 1,
          limit: 10,
          make: 'Toyota',
          model: 'Hilux',
          year: 2020,
          serviceStatus: 'DUE_SOON',
        }}
      />,
    );
    expect(screen.getByLabelText('Make')).toHaveValue('Toyota');
    expect(screen.getByLabelText('Model')).toHaveValue('Hilux');
    expect(screen.getByLabelText('Year')).toHaveValue(2020);
    expect(screen.getByLabelText('Service')).toHaveValue('DUE_SOON');
    rerender(<VehicleFilters maxYear={2030} query={{ page: 1, limit: 10 }} />);
    expect(screen.getByLabelText('Make')).toHaveValue('');
    expect(screen.getByLabelText('Model')).toHaveValue('');
    expect(screen.getByLabelText('Year')).toHaveValue(null);
    expect(screen.getByLabelText('Service')).toHaveValue('');
  });
});
