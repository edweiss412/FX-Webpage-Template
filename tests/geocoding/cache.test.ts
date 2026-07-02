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

vi.mock("@/lib/log", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { geocodeCacheKey, readGeocodeCache, writeGeocodeCache } from "@/lib/geocoding/cache";
import { log } from "@/lib/log";

beforeEach(() => {
  state.read = { data: null, error: null };
  state.write = { error: null };
  state.lastUpsert = null;
  vi.mocked(log.warn).mockClear();
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

describe("cache-fault warns are enriched + distinguishable", () => {
  it("a read fault warns op:'read' with code + error + key", async () => {
    const err = { message: "boom" };
    state.read = { data: null, error: err };
    await readGeocodeCache("read-key");
    expect(log.warn).toHaveBeenCalledWith(
      "geocode cache infra fault",
      expect.objectContaining({
        source: "geocoding/cache",
        code: "GEOCODE_CACHE_FAULT",
        op: "read",
        key: "read-key",
        error: err,
      }),
    );
  });

  it("a write fault warns op:'write' with code + error + key", async () => {
    const err = { message: "denied" };
    state.write = { error: err };
    await writeGeocodeCache({
      queryHash: "write-key",
      venueName: null,
      venueAddress: null,
      city: null,
    });
    expect(log.warn).toHaveBeenCalledWith(
      "geocode cache infra fault",
      expect.objectContaining({
        source: "geocoding/cache",
        code: "GEOCODE_CACHE_FAULT",
        op: "write",
        key: "write-key",
        error: err,
      }),
    );
  });

  it("a throw while parsing the cached row warns op:'parse' (distinct from read/write)", async () => {
    // A truthy row whose `city` getter throws exercises the trailing catch that guards
    // casting the cached value — the only site that reports op:'parse'.
    const err = new Error("corrupt cached row");
    state.read = {
      data: {
        get city() {
          throw err;
        },
        expires_at: "2099-01-01T00:00:00Z",
      },
      error: null,
    };
    await readGeocodeCache("parse-key");
    expect(log.warn).toHaveBeenCalledWith(
      "geocode cache infra fault",
      expect.objectContaining({
        source: "geocoding/cache",
        code: "GEOCODE_CACHE_FAULT",
        op: "parse",
        key: "parse-key",
        error: err,
      }),
    );
  });

  it("two different fault sites are distinguishable by op", async () => {
    state.read = { data: null, error: { message: "r" } };
    await readGeocodeCache("k1");
    state.write = { error: { message: "w" } };
    await writeGeocodeCache({ queryHash: "k2", venueName: null, venueAddress: null, city: null });

    const ops = vi.mocked(log.warn).mock.calls.map((c) => (c[1] as { op?: string }).op);
    expect(ops).toContain("read");
    expect(ops).toContain("write");
    expect(new Set(ops).size).toBeGreaterThan(1);
  });
});
