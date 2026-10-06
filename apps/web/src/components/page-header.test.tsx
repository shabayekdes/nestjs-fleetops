// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title as h1 with description and actions', () => {
    render(
      <PageHeader
        title="Vehicles"
        description="All vehicles"
        actions={<button type="button">Add</button>}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Vehicles' }),
    ).toBeInTheDocument();
    expect(screen.getByText('All vehicles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('omits optional parts', () => {
    render(<PageHeader title="Only" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
