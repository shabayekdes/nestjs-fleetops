// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FuelLogNotFound from './not-found';

describe('FuelLogNotFound', () => {
  it('says the log was not found and links to the vehicles', () => {
    render(<FuelLogNotFound />);
    expect(
      screen.getByRole('heading', { name: 'Fuel log not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to vehicles' }),
    ).toHaveAttribute('href', '/vehicles');
  });
});
