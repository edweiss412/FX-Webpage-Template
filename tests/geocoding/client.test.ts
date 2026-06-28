/**
 * tests/geocoding/client.test.ts
 *
 * Pins the Google Geocoding client contract: { data, error } discrimination, the
 * city-extraction order, transient-retry on 429/5xx/OVER_QUERY_LIMIT, timeout, and
 * the "no key → not_configured (never throws)" degrade. fetch is fully mocked — no
 * network, no real key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeQuery, geocodeVenueCity, isGeocodingConfigured } from "@/lib/geocoding/client";

const KEY = "test-geocoding-key";
const noSleep = () => Promise.resolve();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}
function okGeocode(components: Array<{ types: string[]; long_name: string }>) {
  return jsonResponse({ status: "OK", results: [{ address_components: components }] });
}

beforeEach(() => {
  process.env.GOOGLE_GEOCODING_API_KEY = KEY;
});
afterEach(() => {
  delete process.env.GOOGLE_GEOCODING_API_KEY;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isGeocodingConfigured / geocodeQuery", () => {
  it("isGeocodingConfigured reflects the env key", () => {
    expect(isGeocodingConfigured()).toBe(true);
    delete process.env.GOOGLE_GEOCODING_API_KEY;
    expect(isGeocodingConfigured()).toBe(false);
    process.env.GOOGLE_GEOCODING_API_KEY = "  ";
    expect(isGeocodingConfigured()).toBe(false);
  });

  it("geocodeQuery joins name + address, dropping blanks", () => {
    expect(geocodeQuery("Four Seasons Hotel Chicago", "")).toBe("Four Seasons Hotel Chicago");
    expect(geocodeQuery("The Drake", "140 E Walton Pl, Chicago, IL")).toBe(
      "The Drake, 140 E Walton Pl, Chicago, IL",
    );
    expect(geocodeQuery(null, null)).toBe("");
  });
});

describe("geocodeVenueCity", () => {
  it("returns not_configured (no throw) when the key is absent", async () => {
    delete process.env.GOOGLE_GEOCODING_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Park Hyatt Chicago", "");
    expect(res.error?.kind).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled(); // never hits the network without a key
  });

  it("returns city:null for an empty query without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("", "");
    expect(res).toEqual({ data: { city: null } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("extracts the locality from an OK response, and sends the key + query", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      okGeocode([
        { types: ["street_number"], long_name: "120" },
        { types: ["locality", "political"], long_name: "Chicago" },
        { types: ["administrative_area_level_1"], long_name: "Illinois" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Four Seasons Hotel Chicago", "");
    expect(res).toEqual({ data: { city: "Chicago" } });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("address=Four%20Seasons%20Hotel%20Chicago");
    expect(url).toContain(`key=${KEY}`);
  });

  it("falls back through postal_town/sublocality/admin_area_level_3 when there is no locality", async () => {
    const fetchMock = vi.fn(async () =>
      okGeocode([{ types: ["administrative_area_level_3"], long_name: "Springfield Township" }]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Some Venue", "123 Rural Rd");
    expect(res).toEqual({ data: { city: "Springfield Township" } });
  });

  it("ZERO_RESULTS → city:null (a valid, cacheable 'no city' answer)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "ZERO_RESULTS", results: [] })),
    );
    expect(await geocodeVenueCity("Nowhere", "")).toEqual({ data: { city: null } });
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(okGeocode([{ types: ["locality"], long_name: "Denver" }]));
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Hotel", "Denver", { sleep: noSleep });
    expect(res).toEqual({ data: { city: "Denver" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx then gives up with request_failed after maxRetries", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, 503));
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Hotel", "X", { sleep: noSleep, maxRetries: 2 });
    expect(res.error?.kind).toBe("request_failed");
    expect(res.error?.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("retries on a thrown timeout then gives up (never throws)", async () => {
    const timeoutErr = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const fetchMock = vi.fn(async () => {
      throw timeoutErr;
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Hotel", "X", { sleep: noSleep, maxRetries: 1 });
    expect(res.error).toEqual({ kind: "request_failed", message: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("REQUEST_DENIED (bad key) → api_error, no retry", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ status: "REQUEST_DENIED" }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await geocodeVenueCity("Hotel", "X", { sleep: noSleep });
    expect(res.error).toEqual({ kind: "api_error", message: "REQUEST_DENIED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
