/**
 * P5-F1 — readShowChangeFeed maps EVERY Supabase boundary fault to a typed
 * SyncInfraError (invariant 9). The Phase-6 admin page calls readShowChangeFeed
 * server-side after requireAdmin; an untyped throw / plain Error is an
 * unclassified admin-feed 500. Both THROWN faults (service-role construction,
 * .from()) AND returned {error} at each of the three reads must surface as the
 * existing typed SyncInfraError (operation + source = 'returned_error' |
 * 'thrown_error') so the page boundary can catalog-render or degrade.
 *
 * Negative-regression: stash the wrapper (return a plain Error / let the throw
 * escape) and this file goes RED — the thrown class identity is the contract.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";

const infraMock = vi.hoisted(() => ({
  throwOnConstruct: false,
  throwOnFrom: false,
  // returned-{error} on the Nth from() call (1-based): log read, count read, holds read.
  returnedErrorOnCall: 0 as number,
  callIndex: 0 as number,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (infraMock.throwOnConstruct) {
      throw new Error("META: simulated service-role construction fault");
    }
    return {
      from: () => {
        if (infraMock.throwOnFrom) {
          throw new Error("META: simulated from() infrastructure fault");
        }
        infraMock.callIndex += 1;
        const thisCall = infraMock.callIndex;
        const error =
          infraMock.returnedErrorOnCall === thisCall
            ? { message: `META: returned error on call ${thisCall}` }
            : null;
        // Mirror the two query shapes the impl uses:
        //  - log:   .select(...).eq(...).order(...).limit(...)  → awaited → {data,error}
        //  - count: .select(..., {head}).eq(...)                → awaited → {data,error,count}
        //  - holds: .select(...).eq(...).eq(...)                → awaited → {data,error}
        const result = { data: [], error, count: 0 };
        const thenable = {
          eq() {
            return thenable;
          },
          order() {
            return thenable;
          },
          limit() {
            return Promise.resolve(result);
          },
          then(onF: (v: typeof result) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(result).then(onF, onR);
          },
        };
        return { select: () => thenable };
      },
    };
  },
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
  infraMock.throwOnConstruct = false;
  infraMock.throwOnFrom = false;
  infraMock.returnedErrorOnCall = 0;
  infraMock.callIndex = 0;
});

describe("readShowChangeFeed infra-failure contract (P5-F1)", () => {
  test("service-role construction throw → SyncInfraError", async () => {
    infraMock.throwOnConstruct = true;
    const { readShowChangeFeed } = await importFeed();
    const SyncInfraError = await importSyncInfraError();
    await expect(readShowChangeFeed("show-1")).rejects.toBeInstanceOf(SyncInfraError);
  });

  test("Supabase .from() throw → SyncInfraError", async () => {
    infraMock.throwOnFrom = true;
    const { readShowChangeFeed } = await importFeed();
    const SyncInfraError = await importSyncInfraError();
    await expect(readShowChangeFeed("show-1")).rejects.toBeInstanceOf(SyncInfraError);
  });

  // Returned {error} at each of the three reads (log / count / holds) in turn.
  for (const call of [1, 2, 3]) {
    test(`returned {error} on read #${call} → SyncInfraError`, async () => {
      infraMock.returnedErrorOnCall = call;
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
