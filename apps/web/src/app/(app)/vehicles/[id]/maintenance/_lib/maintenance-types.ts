import type { MaintenanceType } from '@/lib/api/types';

export const MAINTENANCE_TYPES = [
  'OIL_CHANGE',
  'TIRES',
  'BRAKES',
  'INSPECTION',
  'REPAIR',
  'OTHER',
] as const satisfies readonly MaintenanceType[];

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  OIL_CHANGE: 'Oil change',
  TIRES: 'Tires',
  BRAKES: 'Brakes',
  INSPECTION: 'Inspection',
  REPAIR: 'Repair',
  OTHER: 'Other',
};

export function isMaintenanceType(value: unknown): value is MaintenanceType {
  return (
    typeof value === 'string' &&
    (MAINTENANCE_TYPES as readonly string[]).includes(value)
  );
}
