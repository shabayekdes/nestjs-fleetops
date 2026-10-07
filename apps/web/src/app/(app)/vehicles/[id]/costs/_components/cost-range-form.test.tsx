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

import { CostRangeForm } from './cost-range-form';

describe('CostRangeForm', () => {
  it('has two month inputs with the range, a pattern and a placeholder', () => {
    render(<CostRangeForm vehicleId="v1" from="2025-03" to="2026-02" />);
    expect(screen.getByRole('form', { name: 'Cost range' })).toHaveAttribute(
      'action',
      '/vehicles/v1/costs',
    );
    for (const [label, value] of [
      ['From', '2025-03'],
      ['To', '2026-02'],
    ] as const) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('type', 'month');
      expect(input).toHaveAttribute('pattern');
      expect(input).toHaveAttribute('placeholder', 'YYYY-MM');
      expect(input).toHaveValue(value);
    }
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it('resets to the plain path', () => {
    render(<CostRangeForm vehicleId="v1" from="2025-03" to="2026-02" />);
    expect(screen.getByRole('link', { name: 'Reset' })).toHaveAttribute(
      'href',
      '/vehicles/v1/costs',
    );
  });
});
