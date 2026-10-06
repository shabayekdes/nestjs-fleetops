/** Raw Next.js search params: a repeated key arrives as a string array. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** The single string value of a param. An array (repeated key) is invalid. */
export function singleParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Builds `pathname?query`, dropping undefined and empty values. */
export function buildHref(
  pathname: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
