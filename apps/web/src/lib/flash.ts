import { buildHref } from './search-params';

/** Allowlisted `?notice=<key>` messages. Unknown keys show nothing. */
export const FLASH_MESSAGES = {
  'vehicle-created': 'Vehicle created.',
  'vehicle-updated': 'Vehicle updated.',
  'vehicle-deleted': 'Vehicle deleted.',
  'user-created': 'User created.',
  'user-updated': 'User updated.',
  'user-deleted': 'User deleted.',
  'driver-created': 'Driver created.',
  'driver-updated': 'Driver updated.',
  'driver-deleted': 'Driver deleted.',
  'assignment-created': 'Driver assigned.',
  'assignment-ended': 'Assignment ended.',
  'maintenance-created': 'Maintenance record added.',
  'maintenance-updated': 'Maintenance record updated.',
  'maintenance-deleted': 'Maintenance record deleted.',
  'fuel-log-created': 'Fuel log added.',
  'fuel-log-updated': 'Fuel log updated.',
  'fuel-log-deleted': 'Fuel log deleted.',
  'password-changed': 'Password changed.',
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
