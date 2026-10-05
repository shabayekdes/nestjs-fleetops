// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotAllowed } from './not-allowed';

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
});
