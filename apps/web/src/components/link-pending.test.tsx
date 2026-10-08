// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({ useLinkStatus: () => status }));

import { LinkPending } from './link-pending';

describe('LinkPending', () => {
  beforeEach(() => {
    status.pending = false;
  });

  it('is hidden from assistive tech and invisible when idle', () => {
    const { container } = render(<LinkPending />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('data-pending', 'false');
    expect(icon).toHaveClass('opacity-0');
  });

  it('shows a motion-safe spinner while pending', () => {
    status.pending = true;
    const { container } = render(<LinkPending />);
    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('data-pending', 'true');
    expect(icon).toHaveClass('opacity-100', 'motion-safe:animate-spin');
  });
});
