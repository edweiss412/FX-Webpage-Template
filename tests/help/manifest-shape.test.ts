import { describe, expect, it } from "vitest";
import { MANIFEST } from "@/scripts/help-screenshots.manifest";

const ISO_8601_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

describe("help screenshot manifest shape (Task F.1)", () => {
  it("is non-empty", () => {
    expect(Array.isArray(MANIFEST)).toBe(true);
    expect(MANIFEST.length).toBeGreaterThan(0);
  });

  it("has unique keys", () => {
    const keys = MANIFEST.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares required fields for every entry", () => {
    for (const entry of MANIFEST) {
      expect(entry.key, "key").toEqual(expect.any(String));
      expect(entry.key.trim(), "key must not be blank").not.toBe("");
      expect(entry.route, `${entry.key} route`).toEqual(expect.any(String));
      expect(entry.route.startsWith("/"), `${entry.key} route must be absolute`).toBe(true);
      expect(entry.fixture, `${entry.key} fixture`).toEqual(expect.any(String));
      expect(entry.fixture.trim(), `${entry.key} fixture must not be blank`).not.toBe("");
      expect(entry.viewport, `${entry.key} viewport`).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
      expect(entry.viewport.width, `${entry.key} viewport width`).toBeGreaterThan(0);
      expect(entry.viewport.height, `${entry.key} viewport height`).toBeGreaterThan(0);
    }
  });

  it("uses valid ISO 8601 frozen clock instants", () => {
    for (const entry of MANIFEST) {
      expect(entry.frozenClockInstant, `${entry.key} frozenClockInstant`).toMatch(ISO_8601_Z_RE);
      expect(
        Number.isNaN(new Date(entry.frozenClockInstant).getTime()),
        `${entry.key} frozenClockInstant must parse as a Date`,
      ).toBe(false);
    }
  });

  it("uses only supported optional theme values", () => {
    for (const entry of MANIFEST) {
      if (entry.theme === undefined) continue;
      expect(["light", "dark", "both"]).toContain(entry.theme);
    }
  });
});
