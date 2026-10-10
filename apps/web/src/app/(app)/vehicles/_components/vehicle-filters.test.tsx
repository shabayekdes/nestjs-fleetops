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

vi.mock('../actions', () => ({
  loadVehicleModelOptions: vi.fn(async () => ({ options: [] })),
}));

import { VehicleFilters } from './vehicle-filters';

const makes = [
  { id: 'make-1', name: 'Toyota' },
  { id: 'make-2', name: 'Saab' },
];
const vehicleTypes = [{ id: 'type-1', name: 'Car' }];
const models = [{ id: 'model-1', name: 'Corolla' }];

describe('VehicleFilters', () => {
  it('resets the selects and the year when the query changes', () => {
    const { rerender } = render(
      <VehicleFilters
        maxYear={2030}
        makes={makes}
        vehicleTypes={vehicleTypes}
        initialModels={models}
        query={{
          page: 1,
          limit: 10,
          makeId: 'make-1',
          modelId: 'model-1',
          vehicleTypeId: 'type-1',
          year: 2020,
          serviceStatus: 'DUE_SOON',
        }}
      />,
    );
    expect(screen.getByLabelText('Make')).toHaveValue('make-1');
    expect(screen.getByLabelText('Model')).toHaveValue('model-1');
    expect(screen.getByLabelText('Vehicle type')).toHaveValue('type-1');
    expect(screen.getByLabelText('Year')).toHaveValue(2020);
    expect(screen.getByLabelText('Service')).toHaveValue('DUE_SOON');
    rerender(
      <VehicleFilters
        maxYear={2030}
        makes={makes}
        vehicleTypes={vehicleTypes}
        query={{ page: 1, limit: 10 }}
      />,
    );
    expect(screen.getByLabelText('Make')).toHaveValue('');
    expect(screen.getByLabelText('Model')).toHaveValue('');
    expect(screen.getByLabelText('Model')).toBeDisabled();
    expect(screen.getByLabelText('Vehicle type')).toHaveValue('');
    expect(screen.getByLabelText('Year')).toHaveValue(null);
    expect(screen.getByLabelText('Service')).toHaveValue('');
  });

  it('submits ids under the makeId, modelId and vehicleTypeId names', () => {
    render(
      <VehicleFilters
        maxYear={2030}
        makes={makes}
        vehicleTypes={vehicleTypes}
        initialModels={models}
        query={{ page: 1, limit: 20, makeId: 'make-1', modelId: 'model-1' }}
      />,
    );
    expect(screen.getByLabelText('Make')).toHaveAttribute('name', 'makeId');
    expect(screen.getByLabelText('Model')).toHaveAttribute('name', 'modelId');
    expect(screen.getByLabelText('Vehicle type')).toHaveAttribute(
      'name',
      'vehicleTypeId',
    );
    expect(screen.getByLabelText('Make')).not.toBeRequired();
  });
});
