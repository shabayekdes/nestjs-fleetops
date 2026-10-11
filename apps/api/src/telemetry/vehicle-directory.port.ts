/** Telemetry's only view of vehicles. Implemented by the core vehicles module. */
export const VEHICLE_DIRECTORY = Symbol('VEHICLE_DIRECTORY');

export interface VehicleDirectory {
  /** Returns the subset of vehicleIds that exist in the organization. */
  existingVehicleIds(
    organizationId: string,
    vehicleIds: readonly string[],
  ): Promise<Set<string>>;
}
