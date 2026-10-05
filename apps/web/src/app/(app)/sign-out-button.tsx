import { logout } from '@/lib/auth/actions';

export function SignOutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
      >
        Sign out
      </button>
    </form>
  );
}
