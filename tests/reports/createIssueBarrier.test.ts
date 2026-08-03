import { describe, expect, test } from "vitest";

import { awaitCreateIssueEntered, deferred } from "@/tests/reports/_createIssueBarrier";

// The barrier replaced a vi.waitFor poll in the two report-submit race tests
// (BL-CONCURRENT-RETRY-DB-TIMEOUT-FLAKE). Its value over a bare
// `await entered.promise` is entirely in what it does when createIssue is never
// entered: without the race, that case hangs until the 30s test timeout and
// reports "test timed out", which says nothing about why. So the failure path
// is the part worth pinning.

describe("awaitCreateIssueEntered", () => {
  test("resolves when the mock reports it was entered", async () => {
    const entered = deferred<void>();
    const neverSettles = new Promise<void>(() => {});

    setTimeout(() => entered.resolve(), 0);

    await expect(awaitCreateIssueEntered(entered.promise, [neverSettles])).resolves.toBeUndefined();
  });

  test("throws descriptively when every submit settles without entering createIssue", async () => {
    const entered = deferred<void>();

    await expect(
      awaitCreateIssueEntered(entered.promise, [Promise.resolve(409), Promise.resolve(409)]),
    ).rejects.toThrow(/settled before createIssue was entered/);
  });

  test("a rejecting submit reaches the descriptive throw, not an unhandled rejection", async () => {
    const entered = deferred<void>();

    await expect(
      awaitCreateIssueEntered(entered.promise, [Promise.reject(new Error("db down"))]),
    ).rejects.toThrow(/the gate never engaged/);
  });

  test("waits for ALL submits, so one settling early does not trip the barrier", async () => {
    const entered = deferred<void>();
    const loser = Promise.resolve(409);
    const winner = deferred<number>();

    // The loser 409s immediately; the winner is still working its way toward
    // createIssue. A single-promise race would report failure here.
    setTimeout(() => {
      entered.resolve();
      winner.resolve(201);
    }, 5);

    await expect(
      awaitCreateIssueEntered(entered.promise, [loser, winner.promise]),
    ).resolves.toBeUndefined();
  });
});
