const formatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

/** Formats an ISO timestamp in UTC, e.g. "Jun 15, 2026, 10:00 AM UTC". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatter.format(date)} UTC`;
}
