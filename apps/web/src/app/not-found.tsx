import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-gray-600">
        The page you are looking for does not exist.
      </p>
      <Link href="/" className="mt-4 inline-block text-blue-700 underline">
        Back to home
      </Link>
    </main>
  );
}
