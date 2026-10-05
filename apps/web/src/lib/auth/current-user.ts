import 'server-only';
import { cache } from 'react';
import type { CurrentUser } from '@/lib/api/types';
import { sessionApiRequest } from './session-api';

/** The signed-in user from GET /auth/me. The only source of the role. */
export const getCurrentUser = cache(async (): Promise<CurrentUser> =>
  sessionApiRequest<CurrentUser>('/auth/me'),
);
