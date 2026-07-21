/**
 * tests/app/admin/attentionGalleryParams.test.ts
 *
 * Query-parameter parsing for the attention gallery (spec §4.5). The width
 * parameter reaches an inline `style`, so every non-digit form must fall back
 * to absence rather than reach the DOM as "NaNpx".
 */
import { describe, expect, test } from "vitest";
import { parseGalleryParams } from "@/app/admin/dev/attention-gallery/params";

describe("parseGalleryParams", () => {
  test("no parameters at all means no filter and no width", () => {
    expect(parseGalleryParams({})).toEqual({ tier: null, scenarioId: null, maxWidthPx: null });
  });

  test("scenario wins over tier, even across tiers", () => {
    const p = parseGalleryParams({ tier: "1", scenario: "t2-single" });
    expect(p.scenarioId).toBe("t2-single");
  });

  test("an array param takes its first value", () => {
    expect(parseGalleryParams({ tier: ["2", "1"] }).tier).toBe(2);
  });

  test("an empty array is absent", () => {
    expect(parseGalleryParams({ tier: [] }).tier).toBeNull();
  });

  test("every valid tier parses, so the filter is not accidentally tier-1-only", () => {
    expect(parseGalleryParams({ tier: "1" }).tier).toBe(1);
    expect(parseGalleryParams({ tier: "2" }).tier).toBe(2);
    expect(parseGalleryParams({ tier: "3" }).tier).toBe(3);
  });

  test("w accepts digits only and clamps into range", () => {
    expect(parseGalleryParams({ w: "390" }).maxWidthPx).toBe(390);
    expect(parseGalleryParams({ w: "100" }).maxWidthPx).toBe(320);
    expect(parseGalleryParams({ w: "9999" }).maxWidthPx).toBe(1280);
  });

  test("w rejects every non-digit form, falling back to null", () => {
    for (const v of ["", "   ", "-5", "3.5", "1e3", "NaN", "Infinity", "12px", "+5", "０"]) {
      expect(parseGalleryParams({ w: v }).maxWidthPx, v).toBeNull();
    }
  });

  test("a digits-only value beyond MAX_SAFE_INTEGER is absent, not clamped", () => {
    // Number.parseInt("999...") returns a non-safe float; clamping it would put a
    // plausible-looking 1280 on screen for a value the caller never meant.
    expect(parseGalleryParams({ w: "9".repeat(25) }).maxWidthPx).toBeNull();
  });

  test("an unknown tier means all tiers", () => {
    expect(parseGalleryParams({ tier: "7" }).tier).toBeNull();
    expect(parseGalleryParams({ tier: "  " }).tier).toBeNull();
    expect(parseGalleryParams({ tier: "1.0" }).tier).toBeNull();
  });

  test("a blank scenario is absent, not an unknown-id error state", () => {
    expect(parseGalleryParams({ scenario: "   " }).scenarioId).toBeNull();
  });
});
