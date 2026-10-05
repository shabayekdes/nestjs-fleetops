'use server';

import { redirect } from 'next/navigation';
import { loginUrl } from './return-to';
import { deleteSession } from './session';

// No API call: the API has no revocation endpoint; the token simply expires.
export async function logout(): Promise<void> {
  await deleteSession();
  redirect(loginUrl({ reason: 'signed-out' }));
}
