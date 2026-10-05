import { ValidateBy, type ValidationOptions } from 'class-validator';

export interface DecimalStringOptions {
  /** Maximum digits before the decimal point. */
  integerDigits: number;
  /** Maximum digits after the decimal point. */
  fractionDigits: number;
  /** When false the value must be greater than zero. */
  allowZero: boolean;
}

/**
 * Non-negative decimal sent as a JSON string, e.g. "123.45". JSON numbers are
 * rejected on purpose: floats cannot represent money exactly.
 */
export function IsDecimalString(
  { integerDigits, fractionDigits, allowZero }: DecimalStringOptions,
  options?: ValidationOptions,
): PropertyDecorator {
  const pattern = new RegExp(
    `^\\d{1,${integerDigits}}(\\.\\d{1,${fractionDigits}})?$`,
  );
  const kind = allowZero ? 'a decimal string' : 'a positive decimal string';
  return ValidateBy(
    {
      name: 'isDecimalString',
      validator: {
        validate: (value: unknown): boolean => {
          if (typeof value !== 'string' || !pattern.test(value)) return false;
          return allowZero || /[1-9]/.test(value);
        },
        defaultMessage: (): string =>
          `$property must be ${kind} with at most ${integerDigits} integer digits and ${fractionDigits} decimal places, e.g. "123.45"`,
      },
    },
    options,
  );
}
