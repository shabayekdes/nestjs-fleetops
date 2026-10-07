import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Asserts the path and the non-empty search params of the current URL. A GET
 * form also sends its empty fields (`to=`), which are not filters.
 */
export async function expectUrl(
  page: Page,
  path: string,
  params: Record<string, string> = {},
): Promise<void> {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      const found: Record<string, string> = {};
      for (const [key, value] of url.searchParams) {
        if (value !== '') found[key] = value;
      }
      return { path: url.pathname, params: found };
    })
    .toEqual({ path, params });
}
