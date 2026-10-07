/**
 * Canonical form of a non-negative decimal string with exactly `scale`
 * fraction digits, using string operations only (no floats):
 * ("089.9", 2) gives "89.90". Input that is not a plain decimal, or that has
 * more fraction digits than `scale`, is returned unchanged.
 */
export function canonicalDecimal(value: string, scale: number): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value.trim());
  if (!match) return value;
  const fraction = match[2] ?? '';
  if (fraction.length > scale) return value;
  const integer = (match[1] as string).replace(/^0+(?=\d)/, '');
  return scale === 0 ? integer : `${integer}.${fraction.padEnd(scale, '0')}`;
}
