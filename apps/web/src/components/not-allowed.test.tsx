// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { NotAllowed } from './not-allowed';

beforeEach(() => {
  refresh.mockReset();
});

describe('NotAllowed', () => {
  it('shows the message in an alert with a link home', () => {
    render(<NotAllowed />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are not allowed to do this.',
    );
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('refreshes the router once and not again on rerender', () => {
    const { rerender } = render(<NotAllowed />);
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<NotAllowed />);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
