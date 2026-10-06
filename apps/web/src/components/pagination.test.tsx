// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pagination } from './pagination';

function setup(props: { page: number; total: number; limit?: number }) {
  render(
    <Pagination
      page={props.page}
      limit={props.limit ?? 20}
      total={props.total}
      pathname="/vehicles"
      params={{
        make: 'Ford',
        limit: props.limit === 20 ? undefined : props.limit,
      }}
    />,
  );
}

describe('Pagination', () => {
  it('renders nothing when there are no results', () => {
    setup({ page: 1, total: 0 });
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows the range and page count', () => {
    setup({ page: 2, total: 57 });
    expect(screen.getByText('Showing 21–40 of 57')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Pagination' }),
    ).toBeInTheDocument();
  });

  it('clamps the end of the range on the last page', () => {
    setup({ page: 3, total: 57 });
    expect(screen.getByText('Showing 41–57 of 57')).toBeInTheDocument();
  });

  it('has no Previous link on the first page', () => {
    setup({ page: 1, total: 57 });
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
    expect(screen.getByText('Previous')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/vehicles?make=Ford&page=2',
    );
  });

  it('has no Next link on the last page', () => {
    setup({ page: 3, total: 57 });
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/vehicles?make=Ford&page=2',
    );
  });

  it('keeps a non-default limit and drops page=1', () => {
    setup({ page: 2, total: 5, limit: 2 });
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      '/vehicles?make=Ford&limit=2',
    );
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/vehicles?make=Ford&limit=2&page=3',
    );
  });
});
