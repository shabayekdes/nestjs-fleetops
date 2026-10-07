// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/form', () => ({
  default: ({
    action,
    children,
    ...rest
  }: {
    action: string;
    children: ReactNode;
  }) => (
    <form action={action} {...rest}>
      {children}
    </form>
  ),
}));

import { UserFilters } from './user-filters';
describe('UserFilters', () => {
  it('resets the select when the query changes', () => {
    const { rerender } = render(
      <UserFilters query={{ page: 1, limit: 10, role: 'ADMIN' }} />,
    );
    expect(screen.getByLabelText('Role')).toHaveValue('ADMIN');
    rerender(<UserFilters query={{ page: 1, limit: 10 }} />);
    expect(screen.getByLabelText('Role')).toHaveValue('');
  });
});
