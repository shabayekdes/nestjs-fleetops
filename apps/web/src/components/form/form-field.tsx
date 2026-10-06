import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export type FieldControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

/**
 * Label, control, hint and error messages for one field. The control comes
 * from a render function so it receives the id and the aria attributes.
 */
export function FormField({
  name,
  label,
  hint,
  errors,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: (props: FieldControlProps) => ReactNode;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const hasErrors = Boolean(errors?.length);
  const errorId = hasErrors ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      {children({
        id: name,
        'aria-invalid': hasErrors ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {hasErrors ? (
        <p id={errorId} className="text-destructive text-sm">
          {errors?.join(' ')}
        </p>
      ) : null}
    </div>
  );
}
