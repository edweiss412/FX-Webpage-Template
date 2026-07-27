/**
 * tests/cross-cutting/section-header-width-anchors.test.ts
 *
 * Structural pin closing BL-HEADER-PROBE-RESIDUAL-VACUITY finding 1 (spec
 * docs/superpowers/specs/2026-07-26-header-probe-residual-closure-design.md §2/§4):
 * every width the 15-cell section-header matrix renders at MUST be anchored by
 * the real-route width chain in tests/e2e/admin-layout-dimensions.spec.ts.
 * Both suites iterate these two exports, so set inequality here means some
 * matrix width is measured against a container width the product was never
 * proven to render — the exact vacuity the chain exists to prevent. A sixth
 * width added to ROW_WIDTHS without a matching REAL_ROUTE_WIDTHS entry fails
 * here before either e2e suite runs.
 */
import { describe, expect, it } from "vitest";
import { REAL_ROUTE_WIDTHS, ROW_WIDTHS } from "../e2e/_sectionHeaderWidths";

describe("section-header width-chain anchors", () => {
  it("anchors every matrix width on the real route", () => {
    const matrixWidths = Object.keys(ROW_WIDTHS).map(Number).sort((a, b) => a - b);
    const anchored = [...REAL_ROUTE_WIDTHS].sort((a, b) => a - b);
    expect(anchored, "REAL_ROUTE_WIDTHS must equal the ROW_WIDTHS key set").toEqual(matrixWidths);
  });
});
