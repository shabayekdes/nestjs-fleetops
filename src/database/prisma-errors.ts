import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Constraint names / field names reported for a unique violation.
 * adapter-pg puts them in meta.driverAdapterError.cause.constraint.{index|fields};
 * meta.target is kept for non-adapter engines.
 */
export function uniqueConstraintHints(
  meta: Record<string, unknown> | undefined,
): string[] {
  const hints: string[] = [];
  const add = (value: unknown): void => {
    if (typeof value === 'string') {
      hints.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') hints.push(item);
      }
    }
  };
  add(meta?.target);
  const adapterError = meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  const constraint = isRecord(cause) ? cause.constraint : undefined;
  if (isRecord(constraint)) {
    add(constraint.index);
    add(constraint.fields);
  }
  return hints;
}

/**
 * Global safety net for Prisma errors no service mapped itself.
 * Returns undefined for anything that is not a known mapped error.
 */
export function mapPrismaError(error: unknown): HttpException | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }
  switch (error.code) {
    case 'P2002':
      return new ConflictException('Resource already exists');
    case 'P2003':
      return new ConflictException(
        'The request conflicts with related records',
      );
    case 'P2025':
      return new NotFoundException('Resource not found');
    default:
      return undefined;
  }
}
