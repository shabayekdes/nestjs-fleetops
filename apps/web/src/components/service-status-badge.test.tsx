// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServiceStatusBadge } from './service-status-badge';

describe('ServiceStatusBadge', () => {
  it.each([
    ['OVERDUE', 'Overdue'],
    ['DUE_SOON', 'Due soon'],
    ['OK', 'OK'],
    ['UNKNOWN', 'No service date'],
  ] as const)('shows %s as "%s"', (status, label) => {
    render(<ServiceStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
