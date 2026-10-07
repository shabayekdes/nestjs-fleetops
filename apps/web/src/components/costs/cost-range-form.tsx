import Form from 'next/form';
import Link from 'next/link';
import { FormField } from '@/components/form/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MONTH_PATTERN = String.raw`\d{4}-(0[1-9]|1[0-2])`;

/**
 * GET form with two month inputs that submits to `path`. Reset goes back to
 * `path` without params, i.e. the API's default range.
 */
export function CostRangeForm({
  path,
  from,
  to,
}: {
  path: string;
  from: string;
  to: string;
}) {
  return (
    <Form
      key={JSON.stringify([from, to])}
      action={path}
      className="mb-6 flex flex-wrap items-start gap-4"
      aria-label="Cost range"
    >
      <FormField name="from" label="From" hint="Format YYYY-MM">
        {(props) => (
          <Input
            {...props}
            name="from"
            type="month"
            pattern={MONTH_PATTERN}
            placeholder="YYYY-MM"
            className="w-44"
            defaultValue={from}
          />
        )}
      </FormField>
      <FormField name="to" label="To" hint="Format YYYY-MM">
        {(props) => (
          <Input
            {...props}
            name="to"
            type="month"
            pattern={MONTH_PATTERN}
            placeholder="YYYY-MM"
            className="w-44"
            defaultValue={to}
          />
        )}
      </FormField>
      <div className="mt-5 flex items-center gap-2">
        <Button type="submit">Apply</Button>
        <Button variant="outline" asChild>
          <Link href={path}>Reset</Link>
        </Button>
      </div>
    </Form>
  );
}
