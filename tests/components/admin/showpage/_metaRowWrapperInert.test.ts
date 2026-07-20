/**
 * tests/components/admin/showpage/_metaRowWrapperInert.test.ts
 *
 * Structural guard: the Careful row WRAPPERS carry no event handlers.
 *
 * Why a source scan rather than a behavioral test. Adversarial review walked
 * the behavioral guard through onClick, then onPointerDown/onMouseDown, then
 * onPointerEnter/onPointerOver, then onDoubleClick and onContextMenu. Each
 * round added events to the fired sequence and the next round named more.
 * Finite event sampling cannot prove a handler is ABSENT: there are ~60 React
 * DOM event props and the guard only ever fires the ones someone thought of.
 *
 * So the absence is proved at the SOURCE. The wrapper is a plain container; if
 * it ever needs interactivity, that is a design change and this test should be
 * revisited deliberately rather than silently satisfied.
 *
 * Scope honesty: this scans the two row components' wrapper JSX openings only.
 * It does not police the whole file, so the confirm-row and banner markup are
 * untouched.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "app/admin/show/[slug]/RotateShareTokenButton.tsx",
  "app/admin/show/[slug]/PickerResetControl.tsx",
] as const;

/** The wrapper is the element carrying the prescribed wrapper class list. */
const WRAPPER_CLASS_RE = /className="flex w-full flex-col gap-2"/;

describe("Careful row wrappers are non-interactive (spec §4.1, §7.0)", () => {
  for (const file of FILES) {
    it(`${file}: every wrapper JSX opening carries no on* prop`, () => {
      const src = readFileSync(file, "utf8");

      // Every `<div ... className="flex w-full flex-col gap-2" ... >` opening.
      const openings = [...src.matchAll(/<div\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => WRAPPER_CLASS_RE.test(tag));

      expect(openings.length, `expected at least one row wrapper in ${file}`).toBeGreaterThan(0);

      for (const tag of openings) {
        const handlers = [...tag.matchAll(/\bon[A-Z][A-Za-z]*\s*=/g)].map((m) => m[0]);
        expect(handlers, `row wrapper in ${file} must carry no event handler`).toEqual([]);
      }
    });
  }
});
