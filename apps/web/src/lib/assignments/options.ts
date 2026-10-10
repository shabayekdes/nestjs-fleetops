import type { Driver, Vehicle } from '@/lib/api/types';

export type AssignOption = { id: string; label: string };

/**
 * "First Last (LICENSE)", with " — license expired" for an expired license
 * (the API's `licenseStatus`). Display only: the option stays selectable and
 * the API decides on submit.
 */
export function driverOptionLabel(driver: Driver): string {
  const base = `${driver.firstName} ${driver.lastName} (${driver.licenseNumber})`;
  return driver.licenseStatus === 'EXPIRED'
    ? `${base} — license expired`
    : base;
}

/** "Make Model (PLATE)", or the VIN when there is no plate. */
export function vehicleOptionLabel(vehicle: Vehicle): string {
  return `${vehicle.make.name} ${vehicle.model.name} (${vehicle.licensePlate ?? vehicle.vin})`;
}

export function driverOptions(drivers: Driver[]): AssignOption[] {
  return drivers.map((driver) => ({
    id: driver.id,
    label: driverOptionLabel(driver),
  }));
}

export function vehicleOptions(vehicles: Vehicle[]): AssignOption[] {
  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: vehicleOptionLabel(vehicle),
  }));
}
