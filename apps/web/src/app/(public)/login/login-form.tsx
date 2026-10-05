'use client';

import { useActionState } from 'react';
import {
  initialLoginState,
  type LoginField,
  type LoginState,
} from './login-schema';

type Props = {
  action: (previous: LoginState, formData: FormData) => Promise<LoginState>;
  returnTo: string;
  notice?: string;
};

const inputClass =
  'mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600';

function FieldError({
  field,
  messages,
}: {
  field: LoginField;
  messages: string[] | undefined;
}) {
  if (!messages?.length) return null;
  return (
    <p id={`${field}-error`} className="mt-1 text-sm text-red-700">
      {messages.join(' ')}
    </p>
  );
}

export function LoginForm({ action, returnTo, notice }: Props) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialLoginState,
  );

  function errorsFor(field: LoginField) {
    const messages = state.fieldErrors?.[field];
    if (!messages?.length) return { invalid: false, describedBy: undefined };
    return { invalid: true, describedBy: `${field}-error` };
  }

  const org = errorsFor('organizationSlug');
  const email = errorsFor('email');
  const password = errorsFor('password');

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {notice ? (
        <p
          role="status"
          className="rounded bg-blue-50 p-3 text-sm text-blue-900"
        >
          {notice}
        </p>
      ) : null}
      {state.formError ? (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">
          {state.formError}
        </p>
      ) : null}
      <input type="hidden" name="returnTo" value={returnTo} />

      <div>
        <label htmlFor="organizationSlug" className="block text-sm font-medium">
          Organization
        </label>
        <input
          id="organizationSlug"
          name="organizationSlug"
          type="text"
          required
          maxLength={100}
          autoComplete="organization"
          defaultValue={state.values.organizationSlug}
          aria-invalid={org.invalid || undefined}
          aria-describedby={org.describedBy}
          className={inputClass}
        />
        <FieldError
          field="organizationSlug"
          messages={state.fieldErrors?.organizationSlug}
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="username"
          defaultValue={state.values.email}
          aria-invalid={email.invalid || undefined}
          aria-describedby={email.describedBy}
          className={inputClass}
        />
        <FieldError field="email" messages={state.fieldErrors?.email} />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          aria-invalid={password.invalid || undefined}
          aria-describedby={password.describedBy}
          className={inputClass}
        />
        <FieldError field="password" messages={state.fieldErrors?.password} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 disabled:opacity-60"
      >
        {isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
