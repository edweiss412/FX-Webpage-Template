/**
 * tests/geocoding/cache.test.ts
 *
 * Happy-path read/write for the geocode_cache service-role helpers (a custom Supabase
 * mock). The thrown-fault → infra_error contract (invariant 9) is pinned separately in
 * tests/sync/_metaInfraContract.test.ts via the shared throwOnConstruct/throwOnFrom mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  read: { data: unknown; error: unknown };
  write: { error: unknown };
  lastUpsert: { row: Record<string, unknown>; opts: unknown } | null;
} = { read: { data: null, error: null }, write: { error: null }, lastUpsert: null };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ gt: () => ({ maybeSingle: async () => state.read }) }),
      }),
      upsert: async (row: Record<string, unknown>, opts: unknown) => {
        state.lastUpsert = { row, opts };
        return state.write;
      },
    }),
  }),
}));

import { geocodeCacheKey, readGeocodeCache, writeGeocodeCache } from "@/lib/geocoding/cache";

beforeEach(() => {
  state.read = { data: null, error: null };
  state.write = { error: null };
  state.lastUpsert = null;
});
afterEach(() => vi.restoreAllMocks());

describe("geocodeCacheKey", () => {
  it("is deterministic and normalizes case/whitespace", () => {
    const a = geocodeCacheKey("Four Seasons Hotel Chicago", "");
    const b = geocodeCacheKey("  four seasons hotel chicago ", "");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(geocodeCacheKey("A", "B")).not.toBe(geocodeCacheKey("A", "C"));
  });
});

describe("readGeocodeCache", () => {
  it("hit → { kind:'hit', city }", async () => {
    state.read = { data: { city: "Chicago", expires_at: "2099-01-01T00:00:00Z" }, error: null };
    expect(await readGeocodeCache("h")).toEqual({ kind: "hit", city: "Chicago" });
  });

  it("a cached NULL city is still a hit (avoids re-querying a venue Google can't resolve)", async () => {
    state.read = { data: { city: null, expires_at: "2099-01-01T00:00:00Z" }, error: null };
    expect(await readGeocodeCache("h")).toEqual({ kind: "hit", city: null });
  });

  it("no row → miss", async () => {
    state.read = { data: null, error: null };
    expect(await readGeocodeCache("h")).toEqual({ kind: "miss" });
  });

  it("a returned Supabase error → infra_error (never a silent miss)", async () => {
    state.read = { data: null, error: { message: "boom" } };
    expect(await readGeocodeCache("h")).toEqual({ kind: "infra_error" });
  });
});

describe("writeGeocodeCache", () => {
  it("ok → upserts a row with a ~30-day future expiry", async () => {
    const before = Date.now();
    const res = await writeGeocodeCache({
      queryHash: "h",
      venueName: "Four Seasons",
      venueAddress: null,
      city: "Chicago",
    });
    expect(res).toEqual({ kind: "ok" });
    const row = state.lastUpsert!.row;
    expect(row.query_hash).toBe("h");
    expect(row.city).toBe("Chicago");
    expect(state.lastUpsert!.opts).toEqual({ onConflict: "query_hash" });
    const expiresAt = new Date(row.expires_at as string).getTime();
    const days = (expiresAt - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("a returned Supabase error → infra_error", async () => {
    state.write = { error: { message: "denied" } };
    expect(
      await writeGeocodeCache({ queryHash: "h", venueName: null, venueAddress: null, city: null }),
    ).toEqual({ kind: "infra_error" });
  });
});
