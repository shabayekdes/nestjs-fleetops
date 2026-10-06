import Link from 'next/link';
import { NotAllowed } from '@/components/not-allowed';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import type { AssignmentSectionData } from '@/lib/assignments/assignments-api';
import { formatDateTime } from '@/lib/format';
import { buildHref } from '@/lib/search-params';
import type { AssignOption } from '@/lib/assignments/options';
import { AssignForm } from './assign-form';
import { AssignmentHistoryTable } from './assignment-history-table';
import { EndAssignmentButton } from './end-assignment-button';

export const ASSIGNMENTS_PAGE_PARAM = 'assignmentsPage';

type AssignFormProps = Parameters<typeof AssignForm>[0];

type Props = {
  /** The page this section is on: a vehicle's or a driver's. */
  perspective: 'vehicle' | 'driver';
  data: AssignmentSectionData;
  /** The detail page's path, used for the history pagination links. */
  pathname: string;
  /** The bound assign action; used only when nothing is current. */
  assignAction: AssignFormProps['action'];
  /** Options for the assign form; set when nothing is current. */
  options?: AssignOption[];
  warning?: string;
  truncated?: boolean;
  emptyHint?: AssignFormProps['emptyHint'];
};

export function AssignmentSection({
  perspective,
  data,
  pathname,
  assignAction,
  options,
  warning,
  truncated,
  emptyHint,
}: Props) {
  const heading = (
    <h2 id="assignment-heading" className="mb-3 text-lg font-semibold">
      Assignment
    </h2>
  );

  if (data.kind === 'forbidden') {
    return (
      <section className="mt-10" aria-labelledby="assignment-heading">
        {heading}
        <NotAllowed />
      </section>
    );
  }

  const { current, past } = data;
  const other = perspective === 'vehicle' ? 'driver' : 'vehicle';
  const lastPage = Math.max(1, Math.ceil(past.meta.total / past.meta.limit));

  let currentBody;
  if (current) {
    const driverName = `${current.driver.firstName} ${current.driver.lastName}`;
    const vehicleName = `${current.vehicle.make} ${current.vehicle.model}`;
    currentBody = (
      <div className="space-y-3">
        <p className="text-sm">
          {perspective === 'vehicle' ? (
            <>
              <Link
                href={`/drivers/${current.driver.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {driverName}
              </Link>{' '}
              <span className="text-muted-foreground">
                (license{' '}
                <span className="font-mono">
                  {current.driver.licenseNumber}
                </span>
                )
              </span>
            </>
          ) : (
            <>
              <Link
                href={`/vehicles/${current.vehicle.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {vehicleName}
              </Link>{' '}
              <span className="text-muted-foreground">
                ({current.vehicle.licensePlate ?? `VIN ${current.vehicle.vin}`})
              </span>
            </>
          )}
        </p>
        <p className="text-muted-foreground text-sm">
          Since {formatDateTime(current.startedAt)}
        </p>
        <EndAssignmentButton
          assignmentId={current.id}
          vehicleId={current.vehicle.id}
          driverId={current.driver.id}
          returnTo={perspective}
          driverName={driverName}
          vehicleName={vehicleName}
        />
        <p className="text-muted-foreground text-sm">
          End the current assignment to assign another {other}.
        </p>
      </div>
    );
  } else {
    currentBody = (
      <div className="space-y-4">
        <p className="text-sm">No {other} assigned.</p>
        {options ? (
          <AssignForm
            field={perspective === 'vehicle' ? 'driverId' : 'vehicleId'}
            action={assignAction}
            options={options}
            warning={warning}
            truncated={truncated}
            emptyHint={emptyHint}
          />
        ) : null}
      </div>
    );
  }

  let history;
  if (past.meta.total === 0) {
    history = (
      <p className="text-muted-foreground text-sm">No past assignments.</p>
    );
  } else if (past.data.length === 0) {
    history = (
      <div className="space-y-3">
        <p className="text-sm">No assignments on this page</p>
        <Button variant="outline" asChild>
          <Link
            href={buildHref(pathname, {
              [ASSIGNMENTS_PAGE_PARAM]: lastPage === 1 ? undefined : lastPage,
            })}
          >
            Go to the last page
          </Link>
        </Button>
      </div>
    );
  } else {
    history = (
      <>
        <AssignmentHistoryTable
          assignments={past.data}
          perspective={perspective}
        />
        <Pagination
          page={past.meta.page}
          limit={past.meta.limit}
          total={past.meta.total}
          pathname={pathname}
          params={{}}
          pageParam={ASSIGNMENTS_PAGE_PARAM}
        />
      </>
    );
  }

  return (
    <section className="mt-10" aria-labelledby="assignment-heading">
      {heading}
      {currentBody}
      <h3 className="mt-8 mb-3 text-base font-semibold">Past assignments</h3>
      {history}
    </section>
  );
}
