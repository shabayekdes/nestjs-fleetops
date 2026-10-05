import type { ApiHealthResult } from '@/lib/api/health';

const LABELS: Record<ApiHealthResult['state'], string> = {
  ok: 'API is healthy',
  degraded: 'API is degraded',
  timeout: 'API timed out',
  unreachable: 'API is unreachable',
  error: 'API returned an error',
};

export function ApiHealthStatus({
  result,
  apiBaseUrl,
}: {
  result: ApiHealthResult;
  apiBaseUrl: string;
}) {
  return (
    <section aria-label="API health status" className="mt-4">
      <p className="text-lg font-medium">{LABELS[result.state]}</p>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500">API base URL</dt>
        <dd>{apiBaseUrl}</dd>
        {result.state === 'ok' || result.state === 'degraded' ? (
          <>
            <dt className="text-gray-500">Latency</dt>
            <dd>{result.latencyMs} ms</dd>
            {result.health ? (
              <>
                <dt className="text-gray-500">Service</dt>
                <dd>{result.health.service}</dd>
                <dt className="text-gray-500">Database</dt>
                <dd>{result.health.database}</dd>
              </>
            ) : null}
          </>
        ) : null}
        {result.state === 'error' ? (
          <>
            <dt className="text-gray-500">Status</dt>
            <dd>{result.status}</dd>
          </>
        ) : null}
        {result.state !== 'ok' && result.state !== 'degraded' ? (
          <>
            <dt className="text-gray-500">Message</dt>
            <dd>{result.message}</dd>
          </>
        ) : null}
      </dl>
    </section>
  );
}
