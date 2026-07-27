// readWatchSurfaceState (backoff spec §3.6): typed infra faults, never a
// benign-null collapse (invariant 9). Catches: a regression that returns null
// on a fault would render "no row" for an outage and hide the discriminator
// the render-boundary mapping depends on.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  throwOnConstruct: boolean;
  queryThrows: boolean;
  returnedError: unknown;
  row: Record<string, unknown> | null;
} = { throwOnConstruct: false, queryThrows: false, returnedError: null, row: null };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnConstruct) throw new Error("construct threw");
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (state.queryThrows) throw new Error("query threw");
              if (state.returnedError) return { data: null, error: state.returnedError };
              return { data: state.row, error: null };
            },
          }),
        }),
      }),
    };
  },
}));

import { readWatchSurfaceState } from "@/lib/admin/watchSurfaceState";

describe("readWatchSurfaceState (spec §3.6)", () => {
  beforeEach(() => {
    state.throwOnConstruct = false;
    state.queryThrows = false;
    state.returnedError = null;
    state.row = null;
  });

  it("returned {error} → typed infra_error, not null", async () => {
    state.returnedError = { message: "down" };
    await expect(readWatchSurfaceState("f")).resolves.toEqual({ kind: "infra_error" });
  });

  it("thrown query → typed infra_error", async () => {
    state.queryThrows = true;
    await expect(readWatchSurfaceState("f")).resolves.toEqual({ kind: "infra_error" });
  });

  it("client-construction throw → typed infra_error", async () => {
    state.throwOnConstruct = true;
    await expect(readWatchSurfaceState("f")).resolves.toEqual({ kind: "infra_error" });
  });

  it("zero rows → null (the only meaning null carries)", async () => {
    await expect(readWatchSurfaceState("f")).resolves.toBeNull();
  });

  it("row → mapped camelCase values", async () => {
    state.row = {
      next_attempt_at: "2026-07-27T12:15:00.000Z",
      consecutive_failures: 4,
      last_attempt_outcome: "failed",
    };
    await expect(readWatchSurfaceState("f")).resolves.toEqual({
      nextAttemptAt: "2026-07-27T12:15:00.000Z",
      consecutiveFailures: 4,
      lastAttemptOutcome: "failed",
    });
  });
});
