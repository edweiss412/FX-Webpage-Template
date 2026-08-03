// Deterministic barrier for the two report-submit race tests.
//
// Both drive concurrent `submitReport` calls against a real database and need
// to resume the moment the winner has ENTERED the mocked `createIssue` — after
// it claimed the row, before its gate releases. They used to poll for that with
// `vi.waitFor(() => expect(createIssue).toHaveBeenCalledTimes(1))`, whose
// timeout defaults to 1000ms and is NOT derived from `testTimeout`: raising the
// test budget leaves the poll with one second to cover a DB round-trip on a
// loaded CI runner. That is BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE, and the fix
// is not a bigger number — the mock can say when it was entered, so nothing has
// to guess from wall-clock time. Banned repo-wide for DB-touching files by
// tests/cross-cutting/db-test-timeout-floor.test.ts.

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Resolves once the mocked `createIssue` has been entered.
 *
 * `inFlight` is every submit racing right now, and losing the race to ALL of
 * them settling is the failure case: it means no caller ever reached
 * `createIssue`, so the barrier would otherwise hang until the test timeout and
 * report a bare "test timed out" 30s later. Awaiting all of them rather than
 * the first is deliberate — in the first-submit race the loser legitimately
 * returns 409 as soon as it sees the in-flight row, which can happen BEFORE the
 * winner enters `createIssue`, so any single-promise race would report a
 * failure on a healthy run.
 */
export async function awaitCreateIssueEntered(
  entered: Promise<unknown>,
  inFlight: Promise<unknown>[],
): Promise<void> {
  const winner = await Promise.race([
    entered.then(() => "entered" as const),
    // allSettled, not all: a rejecting submit is a legitimate way for the race
    // to end without createIssue, and it must reach the descriptive throw below
    // rather than surface as an unhandled rejection.
    Promise.allSettled(inFlight).then(() => "settled" as const),
  ]);

  if (winner !== "entered") {
    throw new Error(
      "every submitReport settled before createIssue was entered — the gate never engaged, " +
        "so this test is no longer exercising the concurrent path it claims to",
    );
  }
}
