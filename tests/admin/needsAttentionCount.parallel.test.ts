// Phase 2 (nav-perf) E-lite — loadNeedsAttentionCount must run its two head-count
// reads (pending_ingestions, pending_syncs) CONCURRENTLY (Promise.all), not
// sequentially. A deferred mock records when each read is INITIATED (when the
// terminal .is() builds the query promise); a serial impl initiates the 2nd read
// only after the 1st resolves, so it fails the "both started before release" gate.
// Per-query {data,error} infra_error discrimination is preserved (NO allSettled).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: null; count: number | null; error: unknown };

const state = vi.hoisted(() => ({
  started: [] as string[],
  gates: {} as Record<string, (r: Result) => void>,
  throwOnCreate: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnCreate) throw new Error("META: client create failed");
    return {
      from(table: string) {
        const builder = {
          select: () => builder,
          // terminal builder method in the impl — building the promise here is
          // the "read initiated" signal.
          is: () =>
            new Promise<Result>((res) => {
              state.started.push(table);
              state.gates[table] = res;
            }),
        };
        return builder;
      },
    };
  },
}));

import { loadNeedsAttentionCount } from "@/lib/admin/needsAttentionCount";

function release(table: string, count: number | null, error: unknown = null) {
  state.gates[table]!({ data: null, count, error });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  state.started = [];
  state.gates = {};
  state.throwOnCreate = false;
});
afterEach(() => vi.clearAllMocks());

describe("loadNeedsAttentionCount — parallel (Phase 2 E-lite)", () => {
  it("initiates BOTH count reads before either resolves (serial impl fails)", async () => {
    const p = loadNeedsAttentionCount();
    await flush();
    expect(state.started).toContain("pending_ingestions");
    expect(state.started).toContain("pending_syncs");
    expect(state.started).toHaveLength(2);
    release("pending_ingestions", 3);
    release("pending_syncs", 4);
    await expect(p).resolves.toEqual({ kind: "ok", count: 7 });
  });

  it("infra_error when the ingestions read returns an error (per-query discrimination)", async () => {
    const p = loadNeedsAttentionCount();
    await flush();
    release("pending_ingestions", null, new Error("boom"));
    release("pending_syncs", 4);
    await expect(p).resolves.toEqual({ kind: "infra_error" });
  });

  it("infra_error when the syncs read returns an error", async () => {
    const p = loadNeedsAttentionCount();
    await flush();
    release("pending_ingestions", 2);
    release("pending_syncs", null, new Error("boom"));
    await expect(p).resolves.toEqual({ kind: "infra_error" });
  });

  it("infra_error when a count is non-numeric with no error (integrity failure)", async () => {
    const p = loadNeedsAttentionCount();
    await flush();
    release("pending_ingestions", 5);
    release("pending_syncs", null);
    await expect(p).resolves.toEqual({ kind: "infra_error" });
  });

  it("infra_error when the client cannot be constructed", async () => {
    state.throwOnCreate = true;
    await expect(loadNeedsAttentionCount()).resolves.toEqual({ kind: "infra_error" });
    expect(state.started).toHaveLength(0);
  });
});
