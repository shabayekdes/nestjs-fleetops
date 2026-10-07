// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VehicleSectionNav } from './vehicle-section-nav';

const ID = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('VehicleSectionNav', () => {
  it('links the four sections', () => {
    render(<VehicleSectionNav vehicleId={ID} current="overview" />);
    const nav = screen.getByRole('navigation', { name: 'Vehicle sections' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}`,
    );
    expect(screen.getByRole('link', { name: 'Maintenance' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/maintenance`,
    );
    expect(screen.getByRole('link', { name: 'Fuel' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/fuel`,
    );
    expect(screen.getByRole('link', { name: 'Costs' })).toHaveAttribute(
      'href',
      `/vehicles/${ID}/costs`,
    );
  });

  it.each([
    ['overview', 'Overview'],
    ['maintenance', 'Maintenance'],
    ['fuel', 'Fuel'],
    ['costs', 'Costs'],
  ] as const)('marks only %s as the current page', (current, label) => {
    render(<VehicleSectionNav vehicleId={ID} current={current} />);
    const marked = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent(label);
  });
});
