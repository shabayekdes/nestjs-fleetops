// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSkeleton } from './page-skeleton';

describe('PageSkeleton', () => {
  it('is a status with a loading label and default rows', () => {
    render(<PageSkeleton />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading…');
    expect(status.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });

  it('honours rows', () => {
    render(<PageSkeleton rows={2} />);
    expect(
      screen.getByRole('status').querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(3);
  });
});
