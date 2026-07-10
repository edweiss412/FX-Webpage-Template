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
  // seed `warnings: []` — production ParseResult always carries a warnings array
  // (typed non-optional); the geocode-failure path pushes into it.
  return { show: { venue }, warnings: [] } as unknown as ParseResult;
}
function deps(over: Partial<EnrichVenueGeocodeDeps> = {}): EnrichVenueGeocodeDeps {
  return {
    isConfigured: () => true,
    geocode: vi.fn(async () => ({ data: { city: "Chicago", lat: null, lng: null } })),
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
    const d = deps({ cacheRead: vi.fn(async () => ({ kind: "hit", city: "Denver", lat: null, lng: null }) as const) });
    const r = makeResult({ name: "The Brown Palace", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBe("Denver");
    expect(d.geocode).not.toHaveBeenCalled();
    expect(d.cacheWrite).not.toHaveBeenCalled();
  });

  it("cache hit with a NULL city → leaves venue.city unset (display falls back)", async () => {
    const d = deps({ cacheRead: vi.fn(async () => ({ kind: "hit", city: null, lat: null, lng: null }) as const) });
    const r = makeResult({ name: "Mystery Venue", address: "" });
    await enrichVenueGeocode(r, d);
    expect(r.show.venue!.city).toBeUndefined();
    expect(d.geocode).not.toHaveBeenCalled();
  });

  it("cache miss → geocodes, sets venue.city, and caches the result", async () => {
    const d = deps({
      cacheRead: vi.fn(async () => ({ kind: "miss" }) as const),
      geocode: vi.fn(async () => ({ data: { city: "Fort Lauderdale", lat: null, lng: null } })),
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
    const d = deps({ geocode: vi.fn(async () => ({ data: { city: null, lat: null, lng: null } })) });
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
      geocode: vi.fn(async () => ({ data: { city: "Boston", lat: null, lng: null } })),
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
      cacheRead: vi.fn(async () => ({ kind: "hit", city: "Austin", lat: null, lng: null }) as const),
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
      cacheRead: vi.fn(async () => ({ kind: "hit", city: "Reno", lat: null, lng: null }) as const),
      geocode,
    });
    await enrichVenueGeocode(makeResult({ name: "C", address: "" }), d2);
    // ...so geocoding is attempted again on the next miss.
    await enrichVenueGeocode(makeResult({ name: "D", address: "" }), d);
    expect(geocode).toHaveBeenCalledTimes(3); // A, B, D (C was a cache hit)
  });
});

describe("VENUE_GEOCODE_UNRESOLVED emit-scope (Flow 6 §4.3)", () => {
  const geoWarns = (r: ParseResult) =>
    r.warnings.filter((w) => w.code === "VENUE_GEOCODE_UNRESOLVED");

  it("pushes exactly one warn on a genuine geocode res.error", async () => {
    const r = makeResult({ name: "The Hall", address: "1 Main St" });
    await enrichVenueGeocode(
      r,
      deps({ geocode: vi.fn(async () => ({ error: { kind: "timeout" } }) as never) }),
    );
    const hits = geoWarns(r);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("warn");
    // invariant 5: `.message` is plain language, never the raw §12.4 code — the
    // staged-review summary renders a non-actionable data-gap message verbatim.
    expect(hits[0]!.message).not.toBe("VENUE_GEOCODE_UNRESOLVED");
    expect(hits[0]!.message).not.toMatch(/[A-Z0-9]{2,}_[A-Z]/); // no SCREAMING_SNAKE code token
    expect(r.show.venue!.city).toBeUndefined(); // still falls back to address
  });

  it("does NOT emit when unconfigured", async () => {
    const r = makeResult({ name: "H", address: "A" });
    await enrichVenueGeocode(r, deps({ isConfigured: () => false }));
    expect(geoWarns(r)).toHaveLength(0);
  });

  it("does NOT emit on a null-city SUCCESS (geocoder returned no city)", async () => {
    const r = makeResult({ name: "Nowhere Hall", address: "A" });
    await enrichVenueGeocode(r, deps({ geocode: vi.fn(async () => ({ data: { city: null, lat: null, lng: null } })) }));
    expect(geoWarns(r)).toHaveLength(0);
  });

  it("does NOT emit on a cache hit with a null city", async () => {
    const r = makeResult({ name: "Mystery Venue", address: "A" });
    await enrichVenueGeocode(
      r,
      deps({ cacheRead: vi.fn(async () => ({ kind: "hit", city: null, lat: null, lng: null }) as const) }),
    );
    expect(geoWarns(r)).toHaveLength(0);
  });

  it("does NOT emit while the breaker is open (outage already counted)", async () => {
    // trip the breaker with 3 consecutive res.error calls on THROWAWAY results, then a 4th call
    // (breaker open) must NOT emit.
    const d = deps({ geocode: vi.fn(async () => ({ error: { kind: "down" } }) as never) });
    for (let i = 0; i < 3; i++)
      await enrichVenueGeocode(makeResult({ name: `V${i}`, address: "A" }), d);
    const r = makeResult({ name: "AfterBreaker", address: "A" });
    await enrichVenueGeocode(r, d); // breaker open → early return, no geocode call, no emit
    expect(geoWarns(r)).toHaveLength(0);
  });
});

describe("Flow 8.3a — venue.timezone (derive + set from coords)", () => {
  it("sets venue.timezone from cache-hit coords", async () => {
    const r = makeResult({ name: "V", address: "Austin TX" });
    await enrichVenueGeocode(
      r,
      deps({
        cacheRead: vi.fn(
          async () => ({ kind: "hit", city: "Austin", lat: 30.2672, lng: -97.7431 }) as const,
        ),
      }),
    );
    expect(r.show.venue!.timezone).toBe("America/Chicago");
    expect(r.warnings).toHaveLength(0);
  });

  it("sets venue.timezone from live-success coords and caches them", async () => {
    const write = vi.fn(async () => ({ kind: "ok" }) as const);
    const r = makeResult({ name: "V", address: "LA CA" });
    await enrichVenueGeocode(
      r,
      deps({
        cacheRead: vi.fn(async () => ({ kind: "miss" }) as const),
        geocode: vi.fn(async () => ({
          data: { city: "Los Angeles", lat: 34.0522, lng: -118.2437 },
        })),
        cacheWrite: write,
      }),
    );
    expect(r.show.venue!.timezone).toBe("America/Los_Angeles");
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 34.0522, lng: -118.2437 }),
    );
    expect(r.warnings).toHaveLength(0);
  });
});

describe("Flow 8.3a — VENUE_TIMEZONE_UNRESOLVED emit", () => {
  const codes = (r: ParseResult) => r.warnings.map((w) => w.code);

  it("warns on a cache-hit with NULL coords (legacy / un-coordinatable venue)", async () => {
    const r = makeResult({ name: "V", address: "A" });
    await enrichVenueGeocode(
      r,
      deps({ cacheRead: vi.fn(async () => ({ kind: "hit", city: "X", lat: null, lng: null }) as const) }),
    );
    expect(r.show.venue!.timezone).toBeUndefined();
    expect(codes(r)).toEqual(["VENUE_TIMEZONE_UNRESOLVED"]);
  });

  it("warns on a live ZERO_RESULTS (city + coords both null)", async () => {
    const r = makeResult({ name: "V", address: "A" });
    await enrichVenueGeocode(
      r,
      deps({
        cacheRead: vi.fn(async () => ({ kind: "miss" }) as const),
        geocode: vi.fn(async () => ({ data: { city: null, lat: null, lng: null } })),
      }),
    );
    expect(codes(r)).toEqual(["VENUE_TIMEZONE_UNRESOLVED"]);
  });

  it("network-fail emits VENUE_GEOCODE_UNRESOLVED and NOT the tz code (structural dedup)", async () => {
    const r = makeResult({ name: "V", address: "A" });
    await enrichVenueGeocode(
      r,
      deps({
        cacheRead: vi.fn(async () => ({ kind: "miss" }) as const),
        geocode: vi.fn(async () => ({ error: { kind: "request_failed" as const, message: "x" } })),
      }),
    );
    expect(codes(r)).toEqual(["VENUE_GEOCODE_UNRESOLVED"]);
  });

  it("unconfigured → zero warnings, no timezone", async () => {
    const r = makeResult({ name: "V", address: "A" });
    await enrichVenueGeocode(r, deps({ isConfigured: () => false }));
    expect(r.warnings).toHaveLength(0);
    expect(r.show.venue!.timezone).toBeUndefined();
  });

  it("breaker-open → NO VENUE_TIMEZONE_UNRESOLVED (silent, §6)", async () => {
    const geocode = vi.fn(async () => ({ error: { kind: "request_failed" as const, message: "down" } }));
    const d = deps({ geocode, cacheRead: vi.fn(async () => ({ kind: "miss" }) as const) });
    for (let i = 0; i < 3; i++) await enrichVenueGeocode(makeResult({ name: `H${i}`, address: "" }), d);
    const fourth = makeResult({ name: "H4", address: "" });
    await enrichVenueGeocode(fourth, d);
    expect(codes(fourth)).not.toContain("VENUE_TIMEZONE_UNRESOLVED");
    expect(fourth.show.venue!.timezone).toBeUndefined();
  });

  it("idempotency (city-set short-circuit): second enrich is a no-op", async () => {
    const cacheRead = vi.fn(
      async () => ({ kind: "hit", city: "Austin", lat: 30.2672, lng: -97.7431 }) as const,
    );
    const r = makeResult({ name: "V", address: "A" });
    await enrichVenueGeocode(r, deps({ cacheRead }));
    await enrichVenueGeocode(r, deps({ cacheRead })); // venue.city now set → :75 short-circuits
    expect(r.show.venue!.timezone).toBe("America/Chicago");
    expect(r.warnings).toHaveLength(0);
    expect(cacheRead).toHaveBeenCalledTimes(1); // second call returned before the cache read
  });
});
