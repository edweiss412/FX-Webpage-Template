/**
 * tests/sync/enrichVenueGeocode.test.ts
 *
 * The ingest-time venue→city enrichment: cache-first, best-effort, NEVER throws, and a
 * per-process circuit breaker so a Google outage can't slow a whole scan. Deps are
 * injected, so no network / DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParseResult } from "@/lib/parser/types";
import {
  __resetGeocodeBreaker,
  enrichVenueGeocode,
  type EnrichVenueGeocodeDeps,
} from "@/lib/sync/enrichVenueGeocode";

type Venue = NonNullable<ParseResult["show"]["venue"]>;
function makeResult(venue: Partial<Venue> | null): ParseResult {
  return { show: { venue } } as unknown as ParseResult;
}
function deps(over: Partial<EnrichVenueGeocodeDeps> = {}): EnrichVenueGeocodeDeps {
  return {
    isConfigured: () => true,
    geocode: vi.fn(async () => ({ data: { city: "Chicago" } })),
    cacheRead: vi.fn(async () => ({ kind: "miss" }) as const),
    cacheWrite: vi.fn(async () => ({ kind: "ok" }) as const),
    ...over,
  };
}

beforeEach(() => __resetGeocodeBreaker());
afterEach(() => vi.restoreAllMocks());

describe("enrichVenueGeocode", () => {
  it("no-ops when there is no venue, no name, or geocoding is not configured", async () => {
    const d = deps();
    await enrichVenueGeocode(makeResult(null), d);
    await enrichVenueGeocode(makeResult({ name: "  ", address: "" }), d);
    await enrichVenueGeocode(
      makeResult({ name: "Hotel", address: "" }),
      deps({ isConfigured: () => false }),
    );
    expect(d.cacheRead).not.toHaveBeenCalled();
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("is idempotent: a venue that already has a city is left untouched", async () => {
    const d = deps();
    const r = makeResult({ name: "Park Hyatt Chicago", address: "", city: "Chicago" });
    await enrichVenueGeocode(r, d);
    expect(d.cacheRead).not.toHaveBeenCalled();
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("cache hit with a city → sets venue.city WITHOUT calling Google", async () => {
    const d = deps({ cacheRead: vi.fn(async () => ({ kind: "hit", city: "Denver" }) as const) });
    const r = makeResult({ name: "The Brown Palace", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBe("Denver");
    expect(d.geocode).not.toHaveBeenCalled();
    expect(d.cacheWrite).not.toHaveBeenCalled();
  });

  it("cache hit with a NULL city → leaves venue.city unset (display falls back)", async () => {
    const d = deps({ cacheRead: vi.fn(async () => ({ kind: "hit", city: null }) as const) });
    const r = makeResult({ name: "Mystery Venue", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBeUndefined();
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("cache miss → geocodes, sets venue.city, and caches the result", async () => {
    const d = deps({
      cacheRead: vi.fn(async () => ({ kind: "miss" }) as const),
      geocode: vi.fn(async () => ({ data: { city: "Fort Lauderdale" } })),
    });
    const r = makeResult({ name: "Four Seasons Fort Lauderdale", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBe("Fort Lauderdale");
    expect(d.cacheWrite).toHaveBeenCalledTimes(1);
    expect((d.cacheWrite as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      city: "Fort Lauderdale",
    });
  });

  it("geocode returns no city → caches null, leaves venue.city unset", async () => {
    const d = deps({ geocode: vi.fn(async () => ({ data: { city: null } })) });
    const r = makeResult({ name: "Nowhere Hall", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBeUndefined();
    expect((d.cacheWrite as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      city: null,
    });
  });

  it("a cache infra_error still proceeds to geocode (degraded, not blocked)", async () => {
    const d = deps({
      cacheRead: vi.fn(async () => ({ kind: "infra_error" }) as const),
      geocode: vi.fn(async () => ({ data: { city: "Boston" } })),
    });
    const r = makeResult({ name: "The Liberty", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBe("Boston");
  });

  it("geocode error → leaves venue.city unset and NEVER throws", async () => {
    const d = deps({
      geocode: vi.fn(async () => ({ error: { kind: "request_failed" as const, message: "boom" } })),
    });
    const r = makeResult({ name: "Hotel", address: "" });
    await expect(enrichVenueGeocode(r, d)).resolves.toBeUndefined();
    expect(r.show.venue!.city).toBeUndefined();
  });

  it("a thrown dep is swallowed (never throws out of enrichment)", async () => {
    const d = deps({
      cacheRead: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const r = makeResult({ name: "Hotel", address: "" });
    await expect(enrichVenueGeocode(r, d)).resolves.toBeUndefined();
  });

  it("circuit breaker: after 3 consecutive geocode failures it stops calling Google (but still reads the cache)", async () => {
    const geocode = vi.fn(async () => ({
      error: { kind: "request_failed" as const, message: "down" },
    }));
    const cacheRead = vi.fn(async () => ({ kind: "miss" }) as const);
    const d = deps({ geocode, cacheRead });
    for (let i = 0; i < 3; i++) {
      await enrichVenueGeocode(makeResult({ name: `Hotel ${i}`, address: "" }), d);
    }
    expect(geocode).toHaveBeenCalledTimes(3);
    // 4th venue: breaker is open → no further Google call, but the cache IS still read.
    await enrichVenueGeocode(makeResult({ name: "Hotel 4", address: "" }), d);
    expect(geocode).toHaveBeenCalledTimes(3);
    expect(cacheRead).toHaveBeenCalledTimes(4);
  });

  it("a cache hit serves the city AND resets the breaker even when the breaker is OPEN", async () => {
    // The adversarial-review fix: the breaker gates only the Google call, never the
    // cache read — so an already-resolved venue is served (and the breaker reset) even
    // during an outage that opened the breaker.
    const geocode = vi.fn(async () => ({
      error: { kind: "request_failed" as const, message: "down" },
    }));
    const dFail = deps({ geocode });
    for (let i = 0; i < 3; i++) {
      await enrichVenueGeocode(makeResult({ name: `H${i}`, address: "" }), dFail);
    }
    expect(geocode).toHaveBeenCalledTimes(3); // breaker now open
    const dHit = deps({
      geocode,
      cacheRead: vi.fn(async () => ({ kind: "hit", city: "Austin" }) as const),
    });
    const rHit = makeResult({ name: "Cached Venue", address: "" });
    await enrichVenueGeocode(rHit, dHit);
    expect(rHit.show.venue!.city).toBe("Austin"); // served despite the open breaker
    // ...and the breaker is reset, so the next miss geocodes again.
    await enrichVenueGeocode(makeResult({ name: "H-new", address: "" }), dFail);
    expect(geocode).toHaveBeenCalledTimes(4);
  });

  it("the breaker half-opens after the cooldown so it self-heals across warm-container reuse", async () => {
    vi.useFakeTimers();
    try {
      const geocode = vi.fn(async () => ({
        error: { kind: "request_failed" as const, message: "down" },
      }));
      const d = deps({ geocode });
      for (let i = 0; i < 3; i++) {
        await enrichVenueGeocode(makeResult({ name: `H${i}`, address: "" }), d);
      }
      expect(geocode).toHaveBeenCalledTimes(3);
      // Within the cooldown window: still skipped.
      await enrichVenueGeocode(makeResult({ name: "H-during", address: "" }), d);
      expect(geocode).toHaveBeenCalledTimes(3);
      // After the cooldown: one probe is allowed (self-heal).
      vi.advanceTimersByTime(61_000);
      await enrichVenueGeocode(makeResult({ name: "H-after", address: "" }), d);
      expect(geocode).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a cache hit resets the breaker after failures", async () => {
    const geocode = vi.fn(async () => ({
      error: { kind: "request_failed" as const, message: "down" },
    }));
    const d = deps({ geocode });
    await enrichVenueGeocode(makeResult({ name: "A", address: "" }), d);
    await enrichVenueGeocode(makeResult({ name: "B", address: "" }), d);
    // A reachable cache hit resets the failure count...
    const d2 = deps({
      cacheRead: vi.fn(async () => ({ kind: "hit", city: "Reno" }) as const),
      geocode,
    });
    await enrichVenueGeocode(makeResult({ name: "C", address: "" }), d2);
    // ...so geocoding is attempted again on the next miss.
    await enrichVenueGeocode(makeResult({ name: "D", address: "" }), d);
    expect(geocode).toHaveBeenCalledTimes(3); // A, B, D (C was a cache hit)
  });
});
