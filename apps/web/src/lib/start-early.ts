/**
 * Starts work now and lets the caller `await` the result later, in the order
 * that decides error precedence. A rejection that nobody has awaited yet (the
 * caller already left through `notFound()` or a redirect) is not reported as
 * unhandled; awaiting the returned promise still throws it.
 */
export function startEarly<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}
