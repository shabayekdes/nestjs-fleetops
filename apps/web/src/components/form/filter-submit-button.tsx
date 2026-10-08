'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function formQuery(form: HTMLFormElement): string {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form)) {
    if (typeof value === 'string') params.append(key, value);
  }
  return params.toString();
}

/**
 * Submit button for a GET filter form (`next/form`). `useFormStatus` does not
 * report a `next/form` navigation, so this shows the pending state itself: it
 * starts when the form is submitted with a query that differs from the current
 * URL, and ends when the URL's search params change. Purely visual: the
 * navigation is the form's.
 */
export function FilterSubmitButton({ children }: { children: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const searchParams = useSearchParams();
  const current = searchParams?.toString() ?? '';
  const currentRef = useRef(current);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = () => {
      if (formQuery(form) !== currentRef.current) {
        setPendingFrom(currentRef.current);
      }
    };
    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, []);

  // The URL changed: the navigation is done (adjusting state while rendering).
  if (pendingFrom !== null && pendingFrom !== current) setPendingFrom(null);
  const pending = pendingFrom !== null;

  return (
    <Button
      ref={ref}
      type="submit"
      aria-disabled={pending || undefined}
      onClick={pending ? (event) => event.preventDefault() : undefined}
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
      ) : null}
      {children}
      {pending ? <span className="sr-only"> (applying)</span> : null}
    </Button>
  );
}
