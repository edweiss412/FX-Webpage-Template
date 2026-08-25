/**
 * Await a call expected to REJECT, and return its error, typed.
 *
 * `.catch((e: unknown) => e as SomeError)` is the shape this replaces, and it
 * is wrong twice. It types as `SomeError | <the resolved type>`, so every
 * property read after it fails to compile. And a call that wrongly RESOLVED
 * flows through as the resolved value, failing later on a property read rather
 * than on the thing that actually went wrong.
 *
 * This fails on the resolve itself, naming the call.
 */
export async function rejectionFrom<T extends Error>(
  call: Promise<unknown>,
  what: string,
): Promise<T> {
  try {
    await call;
  } catch (error: unknown) {
    return error as T;
  }
  throw new Error(`expected ${what} to reject, but it resolved`);
}
