// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LicenseStatusBadge } from './license-status-badge';

describe('LicenseStatusBadge', () => {
  it('shows "Expired" in words for an expired license', () => {
    render(<LicenseStatusBadge status="EXPIRED" />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('shows "Expires soon" for a license expiring soon', () => {
    render(<LicenseStatusBadge status="EXPIRING_SOON" />);
    expect(screen.getByText('Expires soon')).toBeInTheDocument();
  });

  it('shows nothing for a valid license', () => {
    const { container } = render(<LicenseStatusBadge status="VALID" />);
    expect(container).toBeEmptyDOMElement();
  });
});
