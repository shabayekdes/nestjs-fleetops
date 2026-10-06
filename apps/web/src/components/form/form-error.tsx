import { Notice } from '@/components/notice';

/** Form-level error, announced as an alert. Renders nothing without a message. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <Notice variant="error">{message}</Notice>;
}
