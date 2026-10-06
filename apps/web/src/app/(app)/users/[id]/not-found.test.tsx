// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UserNotFound from './not-found';

describe('UserNotFound', () => {
  it('says the user was not found and links back', () => {
    render(<UserNotFound />);
    expect(
      screen.getByRole('heading', { name: 'User not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute(
      'href',
      '/users',
    );
  });
});
