export type DependencyStatus = 'up' | 'down';
export type MigrationsStatus = 'applied' | 'pending' | 'unknown';

/** Liveness probe result. Touches no dependency. */
export class LivenessResponseDto {
  /** Always `ok`: the process is running. */
  status: 'ok';

  /** Service name. */
  service: string;

  /** ISO 8601 time the check ran. */
  timestamp: string;
}

/** Health check result. Returned with 200, or with 503 when a dependency is down. */
export class HealthResponseDto {
  /** `error` when a dependency is down. */
  status: 'ok' | 'error';

  /** Service name. */
  service: string;

  /** ISO 8601 time the check ran. */
  timestamp: string;

  /** Database connectivity. */
  database: DependencyStatus;
}

/** Readiness check result. Returned with 200, or with 503 when not ready. */
export class ReadinessResponseDto extends HealthResponseDto {
  /** Whether every migration shipped in this build is applied. */
  migrations: MigrationsStatus;
}
