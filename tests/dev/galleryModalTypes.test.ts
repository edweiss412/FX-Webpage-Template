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
  type Assert,
  type IsFn,
  type FnKeys,
} from "@/lib/dev/galleryModalTypes";

// ── Type-level negative proofs (typecheck-gated, no runtime) ─────────────────
// The guards must BITE. `@ts-expect-error` fails the typecheck if the next line
// does NOT error — so these permanently prove the guard rejects the bad shape.

// A leaked function key must flip [FnKeys] extends [never] to false → Assert<false> errors.
// @ts-expect-error a leaked function key must be rejected by the no-fn guard
type _RejectsLeakedFn = Assert<[FnKeys<{ a: string; cb: () => void }>] extends [never] ? true : false>;

// An `undefined`-only prop must NOT be classified as a function (the never-vacuity fix).
type _UndefinedIsNotFn = Assert<IsFn<undefined> extends false ? true : false>;
// A real function IS classified as a function.
type _FnIsFn = Assert<IsFn<() => void> extends true ? true : false>;
type _TypeProofs = [_RejectsLeakedFn, _UndefinedIsNotFn, _FnIsFn];

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
