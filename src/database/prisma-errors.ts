const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Constraint names / field names reported for a unique violation.
 * adapter-pg puts them in meta.driverAdapterError.cause.constraint.{index|fields};
 * meta.target is kept for non-adapter engines.
 */
export function uniqueConstraintHints(
  meta: Record<string, unknown> | undefined,
): string[] {
  const hints: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value === 'string') {
      hints.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') hints.push(item);
      }
    }
  };
  add(meta?.target);
  const adapterError = meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  const constraint = isRecord(cause) ? cause.constraint : undefined;
  if (isRecord(constraint)) {
    add(constraint.index);
    add(constraint.fields);
  }
  return hints;
}
