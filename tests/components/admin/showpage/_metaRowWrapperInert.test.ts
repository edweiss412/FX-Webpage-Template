/**
 * tests/components/admin/showpage/_metaRowWrapperInert.test.ts
 *
 * Structural guard: the Careful row WRAPPERS carry no event handlers.
 *
 * Why a source scan rather than a behavioral test. Adversarial review walked the
 * behavioral guard through `onClick`, then `onPointerDown`/`onMouseDown`, then
 * `onPointerEnter`/`onPointerOver`, then `onDoubleClick`/`onContextMenu`. Each
 * round added events to the fired sequence and the next round named more. Finite
 * event sampling cannot prove a handler is ABSENT: there are ~60 React DOM event
 * props and a guard only fires the ones someone thought of.
 *
 * Spreads are rejected too, because `const p = { onDoubleClick: fn }; <div {...p}>`
 * smuggles a handler past any prop-NAME scan.
 *
 * The scanner is a pure function in `_rowWrapperScan.ts` and is unit-tested
 * below against fixtures, including the correct shape and each escape — a
 * scanner that silently matches nothing would be worse than no scanner.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanRowWrappers, WRAPPER_LITERAL } from "./_rowWrapperScan";

const FILES = [
  "app/admin/show/[slug]/RotateShareTokenButton.tsx",
  "app/admin/show/[slug]/PickerResetControl.tsx",
] as const;

describe("the scanner itself", () => {
  const ok = `<div ${WRAPPER_LITERAL}>{rowButton}</div>`;

  it("finds the prescribed wrapper and reports it clean", () => {
    const scan = scanRowWrappers(ok);
    expect(scan.openings).toHaveLength(1);
    expect(scan.withHandlers).toEqual([]);
    expect(scan.withSpreads).toEqual([]);
  });

  it("flags a handler prop", () => {
    expect(scanRowWrappers(`<div onDoubleClick={x} ${WRAPPER_LITERAL}>`).withHandlers).toHaveLength(
      1,
    );
  });

  it("flags a spread, which hides handlers from a prop-name scan", () => {
    expect(scanRowWrappers(`<div {...props} ${WRAPPER_LITERAL}>`).withSpreads).toHaveLength(1);
  });

  it("does NOT match an assembled class expression - the source-form contract", () => {
    // Documented, not accidental: the wrapper must be written with the literal
    // class string so this scan can find it. If a future edit assembles the
    // string instead, `openings` is empty and the file-level test below FAILS
    // LOUD rather than silently passing.
    expect(scanRowWrappers(`<div className={WRAPPER_CLASSES.join(" ")}>`).openings).toEqual([]);
  });
});

describe("Careful row wrappers are non-interactive (spec §4.1, §7.0)", () => {
  for (const file of FILES) {
    it(`${file}: wrapper present, with no on* prop and no spread`, () => {
      const scan = scanRowWrappers(readFileSync(file, "utf8"));
      expect(
        scan.openings.length,
        `no row wrapper found in ${file}. The wrapper must be written with the literal ` +
          `${WRAPPER_LITERAL} (source-form contract, see _rowWrapperScan.ts).`,
      ).toBeGreaterThan(0);
      expect(scan.withHandlers, `row wrapper in ${file} must carry no event handler`).toEqual([]);
      expect(
        scan.withSpreads,
        `row wrapper in ${file} must carry no JSX spread (it can hide handlers)`,
      ).toEqual([]);
    });
  }
});
