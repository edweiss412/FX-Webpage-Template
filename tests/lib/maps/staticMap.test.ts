import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildStaticMapUrl,
  isStaticMapConfigured,
  staticMapKey,
  DARK_MAP_STYLE,
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
    expect(url).not.toContain("style="); // light omits dark style
  });
  test("dark theme appends the dark style ruleset", () => {
    vi.stubEnv("GOOGLE_STATIC_MAPS_API_KEY", "KEY123");
    const url = buildStaticMapUrl("X", "dark")!;
    expect(url).toContain(encodeURIComponent(DARK_MAP_STYLE).slice(0, 12)); // style present
    expect(url).toContain("style=");
  });
});
