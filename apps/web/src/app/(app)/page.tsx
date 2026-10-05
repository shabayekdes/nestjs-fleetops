import { getCurrentUser } from '@/lib/auth/current-user';

export default async function HomePage() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">FleetOps</h1>
      <p className="mt-2 text-gray-600">
        Signed in as {user.firstName} {user.lastName} ({user.role})
      </p>
    </main>
  );
}
