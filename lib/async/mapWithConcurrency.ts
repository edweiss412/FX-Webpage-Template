/**
 * Map over `items` with a bounded number of concurrently in-flight `fn` calls.
 *
 * Contract:
 *  - **Order-preserving:** `results[i]` always corresponds to `items[i]`,
 *    regardless of completion order. Callers that iterate the result in input
 *    order (e.g. a downstream sequential, lock-ordered phase) are unaffected by
 *    the out-of-order execution.
 *  - **Bounded:** at most `limit` `fn` invocations are in flight at once. With
 *    fewer items than `limit`, only `items.length` workers are spawned.
 *  - **Fail-fast like `Promise.all`:** the returned promise rejects with the
 *    first rejection. Workers that have already started settle their current
 *    `fn` (there is no cancellation), but no further items are picked up after a
 *    rejection is observed by a worker. Safe for side-effect-free `fn` (pure
 *    reads); callers needing per-item isolation should catch inside `fn`.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapWithConcurrency limit must be a positive integer, got ${limit}`);
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    // `nextIndex++` is atomic relative to the single-threaded event loop: the
    // read+increment happens with no intervening await, so each worker claims a
    // unique index before yielding.
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
