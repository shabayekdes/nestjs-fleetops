import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  MongoBulkWriteError,
  MongoNetworkError,
  MongoNetworkTimeoutError,
  MongoOperationTimeoutError,
  MongoServerError,
  MongoServerSelectionError,
} from 'mongodb';
import { mapMongoError } from './mongo-errors.js';

const serverError = (code: number) =>
  new MongoServerError({ message: 'boom', code, errmsg: 'boom' });

describe('mapMongoError', () => {
  it('maps a duplicate key error to 409', () => {
    const mapped = mapMongoError(serverError(11000));
    expect(mapped).toBeInstanceOf(ConflictException);
    expect(mapped?.getStatus()).toBe(409);
    expect(mapped?.message).toBe('Resource already exists');
  });

  it('leaves a bulk write error unmapped even with code 11000', () => {
    const bulk = new MongoBulkWriteError(
      { message: 'dup', code: 11000 },
      // The driver only reads the result for counts here.
      {} as ConstructorParameters<typeof MongoBulkWriteError>[1],
    );
    expect(bulk).toBeInstanceOf(MongoServerError);
    expect(mapMongoError(bulk)).toBeUndefined();
  });

  const unavailable: [string, () => unknown][] = [
    [
      'server selection',
      () => Object.create(MongoServerSelectionError.prototype) as unknown,
    ],
    ['network', () => new MongoNetworkError('reset')],
    ['network timeout', () => new MongoNetworkTimeoutError('timed out')],
    ['operation timeout', () => new MongoOperationTimeoutError('too slow')],
    ['server code 50', () => serverError(50)],
  ];
  it.each(unavailable)('maps %s to 503', (_name, make) => {
    const mapped = mapMongoError(make());
    expect(mapped).toBeInstanceOf(ServiceUnavailableException);
    expect(mapped?.getStatus()).toBe(503);
    expect(mapped?.message).toBe('Telemetry storage is unavailable');
  });

  it('leaves a validator failure (121) unmapped', () => {
    expect(mapMongoError(serverError(121))).toBeUndefined();
  });

  it('leaves other server codes unmapped', () => {
    expect(mapMongoError(serverError(2))).toBeUndefined();
  });

  it.each([
    ['plain Error', new Error('x')],
    ['string 11000', '11000'],
    ['object with code 11000', { code: 11000 }],
    ['null', null],
    ['undefined', undefined],
  ])('returns undefined for %s', (_name, value) => {
    expect(mapMongoError(value)).toBeUndefined();
  });
});
