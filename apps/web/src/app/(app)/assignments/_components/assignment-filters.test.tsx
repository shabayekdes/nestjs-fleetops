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

import { AssignmentFilters } from './assignment-filters';
describe('AssignmentFilters', () => {
  it('resets the select when the query changes', () => {
    const { rerender } = render(
      <AssignmentFilters query={{ page: 1, limit: 10, active: true }} />,
    );
    expect(screen.getByLabelText('Status')).toHaveValue('true');
    rerender(<AssignmentFilters query={{ page: 1, limit: 10 }} />);
    expect(screen.getByLabelText('Status')).toHaveValue('');
  });
});
