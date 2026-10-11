/** DI token for the optional telemetry connectivity check. */
export const TELEMETRY_HEALTH = Symbol('TELEMETRY_HEALTH');

export interface TelemetryHealthCheck {
  /** Resolves when MongoDB answers, rejects otherwise. */
  ping(): Promise<void>;
}
