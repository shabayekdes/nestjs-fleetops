// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormError } from './form-error';
import { FormField } from './form-field';

describe('FormField', () => {
  it('labels the control and wires the hint', () => {
    render(
      <FormField name="vin" label="VIN" hint="17 characters">
        {(props) => <input {...props} name="vin" />}
      </FormField>,
    );
    const input = screen.getByLabelText('VIN');
    expect(input).toHaveAttribute('id', 'vin');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('17 characters');
  });

  it('marks the control invalid and links hint and errors', () => {
    render(
      <FormField name="vin" label="VIN" hint="Hint" errors={['Bad', 'Worse']}>
        {(props) => <input {...props} name="vin" />}
      </FormField>,
    );
    const input = screen.getByLabelText('VIN');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'vin-hint vin-error');
    expect(input).toHaveAccessibleDescription('Hint Bad Worse');
  });
});

describe('FormError', () => {
  it('renders an alert only with a message', () => {
    const { rerender } = render(<FormError message="Nope" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Nope');
    rerender(<FormError message={undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
