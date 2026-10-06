// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/auth/messages';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('is an alert with the default title and message', () => {
    render(<ErrorState />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent(SERVICE_UNAVAILABLE_MESSAGE);
    expect(screen.queryByText(/Reference/)).toBeNull();
  });

  it('shows the reference and action when given', () => {
    render(
      <ErrorState
        reference="r-1"
        action={<button type="button">Retry</button>}
      />,
    );
    expect(screen.getByText('Reference: r-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
