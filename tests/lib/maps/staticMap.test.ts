import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildStaticMapUrl,
  isStaticMapConfigured,
  staticMapKey,
  DARK_MAP_STYLES,
} from "@/lib/maps/staticMap";

const OLD = { ...process.env };
afterEach(() => {
  process.env = { ...OLD };
  vi.unstubAllEnvs();
});

describe("staticMap config", () => {
  test("unconfigured when neither key set", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
    expect(isStaticMapConfigured()).toBe(false);
    expect(staticMapKey()).toBeNull();
    expect(buildStaticMapUrl("Foo, SF", "light")).toBeNull();
  });
  test("dedicated key takes precedence over geocoding key", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "DEDICATED");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "GEO");
    expect(staticMapKey()).toBe("DEDICATED");
  });
  test("falls back to geocoding key", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "");
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "GEO");
    expect(staticMapKey()).toBe("GEO");
    expect(isStaticMapConfigured()).toBe(true);
  });
});

describe("buildStaticMapUrl", () => {
  test("encodes address into center + marker, includes key", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("The Masonic, 1111 California St", "light")!;
    expect(url).toContain("center=The%20Masonic%2C%201111%20California%20St");
    expect(url).toContain("markers=");
    expect(url).toContain("The%20Masonic");
    expect(url).toContain("key=KEY123");
  });
  test("requests a square high-res tile (320x320 @2x) so object-cover never upscales", () => {
    // The tile region is 172px wide × text-column height on desktop and
    // full-width × 160px on mobile (step3ReviewSections venue-map-region) —
    // a 640×640 device-px square survives both crops without upscaling.
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("X", "light")!;
    expect(url).toContain("size=320x320");
    expect(url).toContain("scale=2");
    expect(url).toContain("zoom=15");
    expect(url).toContain("format=png");
  });
  test("both themes hide POI icons/labels (tiny tile — icon clutter dominates)", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const poiOff = encodeURIComponent("feature:poi|visibility:off");
    expect(buildStaticMapUrl("X", "light")!).toContain(`style=${poiOff}`);
    expect(buildStaticMapUrl("X", "dark")!).toContain(`style=${poiOff}`);
  });
  test("light theme applies no color restyling beyond poi-off", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("X", "light")!;
    expect(url.match(/style=/g)).toHaveLength(1); // poi-off only
    expect(url).not.toContain(encodeURIComponent("color:0x"));
  });
  test("dark theme applies the full dark ruleset (ground, labels, roads, water)", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("X", "dark")!;
    for (const rule of DARK_MAP_STYLES) {
      expect(url).toContain(`style=${encodeURIComponent(rule)}`);
    }
    // Labels must be restyled, not just geometry — default light-mode label
    // fills/halos on a dark ground was the shipped defect this pins against.
    const elements = DARK_MAP_STYLES.join(" ");
    expect(elements).toContain("element:geometry");
    expect(elements).toContain("element:labels.text.fill");
    expect(elements).toContain("element:labels.text.stroke");
  });
});
