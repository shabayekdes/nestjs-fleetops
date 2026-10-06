const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for the canonical 8-4-4-4-12 hex form. Check every id from a URL or an
 * action argument with this before it goes into an API path; it also blocks
 * path tricks such as `..%2Fusers`.
 */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}
