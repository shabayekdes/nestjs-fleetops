import 'server-only';
import { z } from 'zod';

const serverEnvSchema = z.object({
  API_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .refine((value) => {
      if (!URL.canParse(value)) return true; // reported by the url check
      const url = new URL(value);
      return url.pathname === '/' && url.search === '' && url.hash === '';
    }, 'API_BASE_URL must be the API origin, e.g. http://localhost:3000; the client adds /api/v1')
    .transform((value) => value.replace(/\/$/, '')),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      'Invalid environment configuration:\n' + z.prettifyError(result.error),
    );
  }
  return result.data;
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
