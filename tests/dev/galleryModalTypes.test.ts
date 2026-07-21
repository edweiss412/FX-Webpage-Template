/**
 * tests/dev/galleryModalTypes.test.ts
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 1)
 *
 * The shared, client-safe types + constants for the attention modal switcher
 * gallery. The load-bearing guarantees are TYPE-LEVEL (compile-time assertions
 * in the module itself against PublishedReviewModalProps); this runtime test
 * pins the two constants and proves the type exports resolve.
 */
import { describe, expect, test } from "vitest";
import {
  GALLERY_SLUG,
  GALLERY_NOW,
  type GalleryModalData,
  type GallerySwitcherScenario,
  type ExcludedScenario,
} from "@/lib/dev/galleryModalTypes";

describe("galleryModalTypes constants", () => {
  test("GALLERY_SLUG is the stable gallery slug", () => {
    expect(GALLERY_SLUG).toBe("gallery");
  });

  test("GALLERY_NOW is a fixed Date (stable relative-time copy)", () => {
    expect(GALLERY_NOW).toBeInstanceOf(Date);
    expect(GALLERY_NOW.toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });

  test("the type exports resolve (compile + import)", () => {
    // A value typed as each export proves the type is exported and usable.
    const excluded: ExcludedScenario = { id: "x", label: "X" };
    expect(excluded.id).toBe("x");
    // GalleryModalData / GallerySwitcherScenario are type-only; referencing them
    // in a type position is the resolution proof (fails to compile if missing).
    const _d: GalleryModalData | null = null;
    const _s: GallerySwitcherScenario | null = null;
    expect(_d).toBeNull();
    expect(_s).toBeNull();
  });
});
