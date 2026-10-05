import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getApiHealth } from '@/lib/api/health';
import { getServerEnv } from '@/lib/env/server';
import { ApiHealthStatus } from './api-health-status';

export const metadata: Metadata = {
  title: 'API health',
  robots: { index: false },
};

export default async function ApiHealthPage() {
  // connection() first so the page is rendered per request; otherwise the
  // production notFound() is prerendered at build time and served with 200.
  await connection();
  if (process.env.NODE_ENV === 'production') notFound();

  const result = await getApiHealth();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">API health</h1>
      <ApiHealthStatus
        result={result}
        apiBaseUrl={getServerEnv().API_BASE_URL}
      />
    </main>
  );
}
