import type { Driver, Vehicle } from '@/lib/api/types';
import { licenseStatus } from '@/lib/license-status';

export type AssignOption = { id: string; label: string };

/**
 * "First Last (LICENSE)", with " — license expired" for an expired license.
 * Display only: the option stays selectable and the API decides on submit.
 */
export function driverOptionLabel(driver: Driver, now?: Date): string {
  const base = `${driver.firstName} ${driver.lastName} (${driver.licenseNumber})`;
  return licenseStatus(driver.licenseExpiresOn, now) === 'expired'
    ? `${base} — license expired`
    : base;
}

/** "Make Model (PLATE)", or the VIN when there is no plate. */
export function vehicleOptionLabel(vehicle: Vehicle): string {
  return `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate ?? vehicle.vin})`;
}

export function driverOptions(drivers: Driver[], now?: Date): AssignOption[] {
  return drivers.map((driver) => ({
    id: driver.id,
    label: driverOptionLabel(driver, now),
  }));
}

export function vehicleOptions(vehicles: Vehicle[]): AssignOption[] {
  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: vehicleOptionLabel(vehicle),
  }));
}
