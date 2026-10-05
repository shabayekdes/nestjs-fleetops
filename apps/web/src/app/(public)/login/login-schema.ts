import { z } from 'zod';

export const loginSchema = z.object({
  organizationSlug: z
    .string()
    .trim()
    .min(1, 'Enter your organization')
    .max(100, 'At most 100 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email')
    .max(254, 'At most 254 characters')
    .pipe(z.email('Enter a valid email address')),
  // Never trimmed: spaces may be part of the password.
  password: z
    .string()
    .min(1, 'Enter your password')
    .max(128, 'At most 128 characters'),
});

export type LoginField = 'organizationSlug' | 'email' | 'password';

export type LoginState = {
  fieldErrors?: Partial<Record<LoginField, string[]>>;
  formError?: string;
  /** Echoed back to refill the form. The password is never echoed. */
  values: { organizationSlug: string; email: string };
};

export const initialLoginState: LoginState = {
  values: { organizationSlug: '', email: '' },
};
