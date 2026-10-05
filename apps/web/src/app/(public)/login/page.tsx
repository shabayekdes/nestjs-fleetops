import type { Metadata } from 'next';
import {
  SESSION_EXPIRED_MESSAGE,
  SIGNED_OUT_MESSAGE,
} from '@/lib/auth/messages';
import { safeReturnTo } from '@/lib/auth/return-to';
import { login } from './actions';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

function noticeFor(reason: string | string[] | undefined): string | undefined {
  if (reason === 'expired') return SESSION_EXPIRED_MESSAGE;
  if (reason === 'signed-out') return SIGNED_OUT_MESSAGE;
  return undefined;
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { reason, returnTo } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-semibold">Sign in to FleetOps</h1>
      <LoginForm
        action={login}
        returnTo={safeReturnTo(returnTo)}
        notice={noticeFor(reason)}
      />
    </main>
  );
}
