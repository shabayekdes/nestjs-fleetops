import { Injectable } from '@nestjs/common';

export type HealthStatus = {
  status: 'ok';
  service: string;
  timestamp: string;
};

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'fleetops-api',
      timestamp: new Date().toISOString(),
    };
  }
}
