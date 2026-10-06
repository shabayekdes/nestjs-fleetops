// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title as h2, description and action', () => {
    render(
      <EmptyState
        title="Nothing here"
        description="Add one"
        action={<button type="button">Add</button>}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Nothing here' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Add one')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
