// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppError from './error';

function setup(digest?: string) {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const retry = vi.fn();
  const error = Object.assign(new Error('secret db detail'), { digest });
  render(<AppError error={error} retry={retry} />);
  return retry;
}

describe('AppError', () => {
  it('shows generic text and the digest, never the message', () => {
    setup('abc123');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent('Reference: abc123');
    expect(screen.queryByText(/secret db detail/)).toBeNull();
  });

  it('omits the reference without a digest', () => {
    setup();
    expect(screen.queryByText(/Reference/)).toBeNull();
  });

  it('retries on click', () => {
    const retry = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
