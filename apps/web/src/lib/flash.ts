import { buildHref } from './search-params';

/** Allowlisted `?notice=<key>` messages. Unknown keys show nothing. */
export const FLASH_MESSAGES = {
  'vehicle-created': 'Vehicle created.',
  'vehicle-updated': 'Vehicle updated.',
  'vehicle-deleted': 'Vehicle deleted.',
} as const;

export type FlashKey = keyof typeof FLASH_MESSAGES;

export function flashMessage(param: unknown): string | undefined {
  if (typeof param !== 'string') return undefined;
  return Object.hasOwn(FLASH_MESSAGES, param)
    ? FLASH_MESSAGES[param as FlashKey]
    : undefined;
}

/** Appends `?notice=<key>` to an internal path. */
export function withFlash(path: string, key: FlashKey): string {
  return buildHref(path, { notice: key });
}
