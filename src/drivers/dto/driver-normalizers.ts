export { trim, trimUpper } from '../../vehicles/dto/vehicle-normalizers.js';

export const LICENSE_NUMBER_PATTERN = /^[A-Z0-9](?:[A-Z0-9 -]*[A-Z0-9])?$/;
export const LICENSE_NUMBER_MESSAGE =
  'licenseNumber may contain only letters, digits, spaces and hyphens, and must start and end with a letter or digit';
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_ONLY_MESSAGE =
  'licenseExpiresOn must be in YYYY-MM-DD format';
