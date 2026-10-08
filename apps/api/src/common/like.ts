/**
 * Prisma passes `contains`/`startsWith` to (I)LIKE without escaping, so `%`
 * and `_` typed by a user would act as wildcards. Escape them, and `\`, the
 * default LIKE escape character in PostgreSQL.
 */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');
