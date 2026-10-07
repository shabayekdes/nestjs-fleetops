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

import { DriverFilters } from './driver-filters';
describe('DriverFilters', () => {
  it('resets the select when the query changes', () => {
    const { rerender } = render(
      <DriverFilters
        query={{ page: 1, limit: 10, licenseStatus: 'EXPIRING_SOON' }}
      />,
    );
    expect(screen.getByLabelText('License', { exact: true })).toHaveValue(
      'EXPIRING_SOON',
    );
    rerender(<DriverFilters query={{ page: 1, limit: 10 }} />);
    expect(screen.getByLabelText('License', { exact: true })).toHaveValue('');
  });
});
