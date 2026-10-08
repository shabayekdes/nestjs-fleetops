// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { FilterSubmitButton } from './filter-submit-button';

function Harness() {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <input name="make" aria-label="Make" defaultValue="Ford" />
      <FilterSubmitButton>Apply</FilterSubmitButton>
    </form>
  );
}

describe('FilterSubmitButton', () => {
  beforeEach(() => {
    nav.search = '';
  });

  it('shows a pending state after submitting a changed query and clears when the URL changes', () => {
    const { rerender } = render(<Harness />);
    const button = screen.getByRole('button', { name: 'Apply' });
    expect(button).not.toHaveAttribute('aria-disabled');

    act(() => {
      fireEvent.submit(button.closest('form')!);
    });
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button')).toHaveTextContent('(applying)');

    nav.search = 'make=Ford';
    rerender(<Harness />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled');
  });

  it('does not get stuck when the submitted query equals the current URL', () => {
    nav.search = 'make=Ford';
    render(<Harness />);
    act(() => {
      fireEvent.submit(screen.getByRole('button').closest('form')!);
    });
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled');
  });

  it('blocks a second click while pending', () => {
    render(<Harness />);
    act(() => {
      fireEvent.submit(screen.getByRole('button').closest('form')!);
    });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('button').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });
});
