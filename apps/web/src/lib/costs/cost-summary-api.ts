import 'server-only';
import type { CostSummary } from '@/lib/api/types';
import { sessionApiRequest } from '@/lib/auth/session-api';
import type { CostQuery } from './cost-params';

/** The caller must check `isUuid(vehicleId)` first. */
export function getCostSummary(
  vehicleId: string,
  query: CostQuery,
): Promise<CostSummary> {
  return sessionApiRequest<CostSummary>(
    `/vehicles/${encodeURIComponent(vehicleId)}/cost-summary`,
    { query },
  );
}

/** The fleet-wide summary (ADMIN and MANAGER). Same shape and rules. */
export function getFleetCostSummary(query: CostQuery): Promise<CostSummary> {
  return sessionApiRequest<CostSummary>('/cost-summary', { query });
}
