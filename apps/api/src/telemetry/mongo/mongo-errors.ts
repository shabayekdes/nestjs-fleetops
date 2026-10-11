import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import {
  MongoBulkWriteError,
  MongoNetworkError,
  MongoOperationTimeoutError,
  MongoServerError,
  MongoServerSelectionError,
} from 'mongodb';

const DUPLICATE_KEY = 11000;
const EXCEEDED_TIME_LIMIT = 50;

/** Maps known MongoDB driver errors to HTTP exceptions. Undefined = unmapped. */
export function mapMongoError(error: unknown): HttpException | undefined {
  // Bulk write errors extend MongoServerError: keep them unmapped (500).
  if (error instanceof MongoBulkWriteError) return undefined;

  if (error instanceof MongoServerError) {
    if (error.code === DUPLICATE_KEY) {
      return new ConflictException('Resource already exists');
    }
    if (error.code === EXCEEDED_TIME_LIMIT) {
      return new ServiceUnavailableException(
        'Telemetry storage is unavailable',
      );
    }
    return undefined;
  }

  if (
    error instanceof MongoServerSelectionError ||
    error instanceof MongoNetworkError ||
    error instanceof MongoOperationTimeoutError
  ) {
    return new ServiceUnavailableException('Telemetry storage is unavailable');
  }
  return undefined;
}
