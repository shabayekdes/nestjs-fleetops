export { trim, trimUpper } from '../../vehicles/dto/vehicle-normalizers.js';

export const LICENSE_NUMBER_PATTERN = /^[A-Z0-9](?:[A-Z0-9 -]*[A-Z0-9])?$/;
export const LICENSE_NUMBER_MESSAGE =
  'licenseNumber may contain only letters, digits, spaces and hyphens, and must start and end with a letter or digit';
export {
  DATE_ONLY_MESSAGE,
  DATE_ONLY_PATTERN,
} from '../../common/date-only.js';
