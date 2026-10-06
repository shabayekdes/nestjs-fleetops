// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import VehicleNotFound from './not-found';

it('says the vehicle was not found and links back', () => {
  render(<VehicleNotFound />);
  expect(
    screen.getByRole('heading', { name: 'Vehicle not found' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'Back to vehicles' }),
  ).toHaveAttribute('href', '/vehicles');
});
