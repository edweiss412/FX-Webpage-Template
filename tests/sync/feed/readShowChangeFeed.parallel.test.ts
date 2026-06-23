/**
 * Task 5 (A4 part 1) — readShowChangeFeed parallelization, concurrency proof.
 *
 * NON-tautological: the three reads (show_change_log rows, count, sync_holds)
 * return DEFERRED promises that resolve only on a manual trigger. A SERIAL impl
 * initiates read #2 only after #1 resolves, so with the gates un-released only
 * the FIRST read would have started. We assert all THREE reads are initiated
 * BEFORE any resolves — which a serial impl cannot satisfy.
 *
 * Also asserts the typed-error CONTRACT survives parallelization: a returned
 * {error} on ANY of the three reads still maps to SyncInfraError (source =
 * 'returned_error'), independent of which read it was — so the existing
 * call-index-based infra test's contract holds even though all 3 now fire.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

type FeedResult = { data: unknown[]; error: { message: string } | null; count: number };

const harness = vi.hoisted(() => ({
  // record the moment each read is INITIATED (in from()→select chain await)
  started: [] as string[],
  // release deferred reads
  gates: [] as Array<() => void>,
  // when set, the read whose 1-based index matches gets a returned {error}
  errorOnCall: 0 as number,
  // when true, the reads are deferred (gated); false → resolve immediately
  deferred: true as boolean,
  callIndex: 0,
}));

// The three reads, in array-literal order, are:
//   1. show_change_log rows: .select(...).eq(...).order(...).limit(...)
//   2. count:                .select(..., {head}).eq(...)
//   3. sync_holds:           .select(...).eq(...).eq(...)
// Each shape resolves to {data,error,count}. We tag the read by its call index.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => {
      harness.callIndex += 1;
      const thisCall = harness.callIndex;
      const label = `read#${thisCall}`;
      const error =
        harness.errorOnCall === thisCall ? { message: `boom on call ${thisCall}` } : null;
      const result: FeedResult = { data: [], error, count: 0 };
      const settle = (): Promise<FeedResult> => {
        harness.started.push(label);
        if (!harness.deferred) return Promise.resolve(result);
        return new Promise<FeedResult>((res) => {
          harness.gates.push(() => res(result));
        });
      };
      const thenable: Record<string, unknown> = {};
      const chain = () => thenable;
      thenable.eq = chain;
      thenable.order = chain;
      thenable.limit = () => settle();
      thenable.then = (onF: (v: FeedResult) => unknown, onR?: (e: unknown) => unknown) =>
        settle().then(onF, onR);
      return { select: () => thenable };
    },
  }),
}));

async function importFeed() {
  vi.resetModules();
  return import("@/lib/sync/feed/readShowChangeFeed");
}
async function importSyncInfraError() {
  const { SyncInfraError } = await import("@/lib/sync/perFileProcessor");
  return SyncInfraError;
}

beforeEach(() => {
  harness.started = [];
  harness.gates = [];
  harness.errorOnCall = 0;
  harness.deferred = true;
  harness.callIndex = 0;
});

describe("readShowChangeFeed — parallel 3 reads (A4)", () => {
  test("NON-tautological: all 3 reads are initiated before any resolves (concurrency)", async () => {
    harness.deferred = true;
    const { readShowChangeFeed } = await importFeed();
    const p = readShowChangeFeed("show-1");
    // flush microtasks so the parallel wave initiates every read
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    // All three reads must have started before any gate is released.
    expect(harness.started).toEqual(expect.arrayContaining(["read#1", "read#2", "read#3"]));
    expect(harness.started.length).toBe(3);
    // release and let it finish
    harness.gates.splice(0).forEach((g) => g());
    await p;
  });

  // Typed-error CONTRACT (not call order): a returned {error} on ANY of the
  // three reads still maps to SyncInfraError (returned_error) even though all
  // three now fire concurrently.
  for (const call of [1, 2, 3]) {
    test(`returned {error} on read #${call} → SyncInfraError (contract holds under Promise.all)`, async () => {
      harness.deferred = false;
      harness.errorOnCall = call;
      const { readShowChangeFeed } = await importFeed();
      const SyncInfraError = await importSyncInfraError();
      const err = await readShowChangeFeed("show-1").then(
        () => null,
        (e) => e,
      );
      expect(err).toBeInstanceOf(SyncInfraError);
      expect((err as { source: string }).source).toBe("returned_error");
    });
  }
});
