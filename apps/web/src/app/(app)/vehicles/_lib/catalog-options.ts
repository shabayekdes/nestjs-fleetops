export type CatalogOption = { id: string; name: string };
export type SelectOption = { id: string; label: string };

/**
 * Select options from catalog entries. The saved value of a vehicle may be
 * retired (no longer in the active list); it is appended as "Name (retired)"
 * so it stays visible and selected, while new choices come only from the list.
 */
export function withRetired(
  options: CatalogOption[],
  current: CatalogOption | undefined,
): SelectOption[] {
  const list = options.map(({ id, name }) => ({ id, label: name }));
  if (current && !options.some((option) => option.id === current.id)) {
    list.push({ id: current.id, label: `${current.name} (retired)` });
  }
  return list;
}
