// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LicenseStatusBadge } from './license-status-badge';

const now = new Date('2026-03-10T12:00:00Z');

describe('LicenseStatusBadge', () => {
  it('shows "Expired" in words for an expired license', () => {
    render(<LicenseStatusBadge expiresOn="2026-03-09" now={now} />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('shows "Expires soon" through 30 days', () => {
    render(<LicenseStatusBadge expiresOn="2026-04-09" now={now} />);
    expect(screen.getByText('Expires soon')).toBeInTheDocument();
  });

  it('shows nothing for a valid or invalid date', () => {
    const { container } = render(
      <>
        <LicenseStatusBadge expiresOn="2027-01-01" now={now} />
        <LicenseStatusBadge expiresOn="bad" now={now} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
