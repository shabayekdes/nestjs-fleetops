/** State returned by a form Server Action and read through useActionState. */
export type FormState<F extends string> = {
  /** Echoed back to refill the form: React resets uncontrolled forms. */
  values: Partial<Record<F, string>>;
  fieldErrors?: Partial<Record<F, string[]>>;
  formError?: string;
};

export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
