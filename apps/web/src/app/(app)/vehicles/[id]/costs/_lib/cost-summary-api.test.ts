import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionApiRequest = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session-api', () => ({ sessionApiRequest }));

import { getCostSummary } from './cost-summary-api';

beforeEach(() => {
  sessionApiRequest.mockReset();
  sessionApiRequest.mockResolvedValue({});
});

describe('getCostSummary', () => {
  it('encodes the id and passes the range through', async () => {
    await getCostSummary('a/b', { from: '2025-03', to: '2026-02' });
    expect(sessionApiRequest).toHaveBeenCalledWith(
      '/vehicles/a%2Fb/cost-summary',
      { query: { from: '2025-03', to: '2026-02' } },
    );
  });

  it('sends an empty query when no range is given', async () => {
    await getCostSummary('v', {});
    expect(sessionApiRequest).toHaveBeenCalledWith('/vehicles/v/cost-summary', {
      query: {},
    });
  });
});
