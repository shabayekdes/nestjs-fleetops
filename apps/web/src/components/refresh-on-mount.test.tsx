// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { RefreshOnMount } from './refresh-on-mount';

beforeEach(() => {
  refresh.mockReset();
});

describe('RefreshOnMount', () => {
  it('refreshes the router once on mount and not again on rerender', () => {
    const { rerender } = render(<RefreshOnMount />);
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<RefreshOnMount />);
    rerender(<RefreshOnMount />);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('renders nothing', () => {
    const { container } = render(<RefreshOnMount />);
    expect(container).toBeEmptyDOMElement();
  });
});
