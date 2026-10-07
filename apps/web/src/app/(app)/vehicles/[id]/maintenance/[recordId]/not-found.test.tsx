// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MaintenanceRecordNotFound from './not-found';

describe('MaintenanceRecordNotFound', () => {
  it('says the record was not found and links to the vehicles', () => {
    render(<MaintenanceRecordNotFound />);
    expect(
      screen.getByRole('heading', { name: 'Maintenance record not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to vehicles' }),
    ).toHaveAttribute('href', '/vehicles');
  });
});
