// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

import { MobileNav } from './mobile-nav';

describe('MobileNav', () => {
  it('opens a dialog with the Main nav and closes after a link click', () => {
    render(<MobileNav role="ADMIN" />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('FleetOps');
    expect(
      within(dialog).getByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('link', { name: 'Dashboard' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
