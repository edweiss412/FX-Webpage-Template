import { describe, expect, it } from "vitest";
import {
  CARET_EDGE_INSET,
  CARET_HEIGHT,
  CARET_INNER_OFFSET,
  CARET_WIDTH,
  GAP,
  VIEWPORT_INSET,
  computePopoverPlacement,
  insetRect,
  intersectRects,
  type PopoverPlacementInput,
  type Rect,
} from "@/lib/popover/position";

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** Baseline: 1000x800 bounds already inset; 20x20 trigger; 288x200 natural body. */
function input(over: Partial<PopoverPlacementInput> = {}): PopoverPlacementInput {
  return {
    trigger: rect(500, 300, 20, 20),
    naturalSize: { width: 288, height: 200 },
    wrappedHeightAt: () => 200,
    bounds: rect(8, 8, 984, 784),
    preferredSide: "bottom",
    align: "right",
    ...over,
  };
}

describe("numeric pins (spec §4.2 constants - independent of geometry uses)", () => {
  it("GAP === 6", () => expect(GAP).toBe(6));
  it("VIEWPORT_INSET === 8", () => expect(VIEWPORT_INSET).toBe(8));
});

describe("computePopoverPlacement decision table", () => {
  it("fits-below: preferred bottom used, y = trigger.bottom + GAP", () => {
    const p = computePopoverPlacement(input());
    expect(p).toMatchObject({ kind: "placed", side: "bottom", maxHeight: null, maxWidth: null });
    if (p.kind !== "placed") throw new Error("unreachable");
    expect(p.viewport.y).toBe(320 + GAP);
    expect(p.viewport.x).toBe(520 - 288); // align right: trigger.right − width
  });

  it("fits-above-only: flips, y = trigger.top − GAP − height", () => {
    const p = computePopoverPlacement(input({ trigger: rect(500, 700, 20, 20) })); // spaceBelow = 792−720−6=66
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.side).toBe("top");
    expect(p.viewport.y).toBe(700 - GAP - 200);
    expect(p.maxHeight).toBeNull();
  });

  it("neither side fits: larger side + maxHeight === that space", () => {
    const tall = input({
      trigger: rect(500, 390, 20, 20),
      naturalSize: { width: 288, height: 600 },
      wrappedHeightAt: () => 600,
    });
    // spaceAbove = 390−8−6 = 376; spaceBelow = 792−410−6 = 376 → tie → preferredSide (bottom)
    const p = computePopoverPlacement(tall);
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.side).toBe("bottom");
    expect(p.maxHeight).toBe(376);
    expect(p.viewport.y).toBe(410 + GAP);
  });

  it("equal-space tie in the fits branch resolves to preferredSide=top", () => {
    const p = computePopoverPlacement(
      input({ trigger: rect(500, 390, 20, 20), preferredSide: "top" }),
    ); // both spaces 376 ≥ 200
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.side).toBe("top");
  });

  it("exact-fit equality on the preferred side places without shrink", () => {
    const p = computePopoverPlacement(
      input({ naturalSize: { width: 288, height: 466 }, wrappedHeightAt: () => 466 }),
    ); // spaceBelow = 792−320−6 = 466 exactly
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.side).toBe("bottom");
    expect(p.maxHeight).toBeNull();
  });

  it("preferred-top symmetry: exact fit above", () => {
    const p = computePopoverPlacement(
      input({
        preferredSide: "top",
        trigger: rect(500, 300, 20, 20),
        naturalSize: { width: 288, height: 286 }, // spaceAbove = 300−8−6 = 286
        wrappedHeightAt: () => 286,
      }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.side).toBe("top");
    expect(p.maxHeight).toBeNull();
  });

  it("width-first (R2 F1 composite): narrow bounds shrink width, wrapped height flips the side", () => {
    const p = computePopoverPlacement(
      input({
        bounds: rect(8, 8, 200, 784), // width 200 < natural 288 → maxWidth engages
        trigger: rect(60, 700, 20, 20), // spaceBelow=66, spaceAbove=686
        naturalSize: { width: 288, height: 60 }, // unwrapped would fit below
        wrappedHeightAt: (w) => (w === 200 ? 300 : 60), // wrapping makes it tall → must flip up
      }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.maxWidth).toBe(200);
    expect(p.side).toBe("top");
    expect(p.viewport.y).toBe(700 - GAP - 300);
  });

  it("horizontal clamp saturation at both edges", () => {
    const left = computePopoverPlacement(input({ align: "right", trigger: rect(10, 300, 20, 20) }));
    if (left.kind !== "placed") throw new Error("expected placed");
    expect(left.viewport.x).toBe(8); // clamped to bounds.left
    const right = computePopoverPlacement(
      input({ align: "left", trigger: rect(970, 300, 20, 20) }),
    );
    if (right.kind !== "placed") throw new Error("expected placed");
    expect(right.viewport.x).toBe(992 - 288); // bounds.right − width
  });

  it("width === bounds.width boundary places with no maxWidth", () => {
    const p = computePopoverPlacement(
      input({ bounds: rect(8, 8, 288, 784), trigger: rect(60, 300, 20, 20) }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.maxWidth).toBeNull();
  });

  describe("hidden gate", () => {
    it.each<[string, PopoverPlacementInput]>([
      ["zero-area trigger (zero width)", input({ trigger: rect(500, 300, 0, 20) })],
      ["zero-area trigger (zero height)", input({ trigger: rect(500, 300, 20, 0) })],
      ["trigger fully outside bounds", input({ trigger: rect(2000, 300, 20, 20) })],
      ["trigger touching edge, zero overlap area", input({ trigger: rect(992, 300, 20, 20) })],
      [
        "trigger spanning bounds vertically (both spaces 0)",
        input({ trigger: rect(500, 8, 20, 784) }),
      ],
      ["degenerate bounds (zero width)", input({ bounds: rect(8, 8, 0, 784) })],
      ["degenerate bounds (negative height)", input({ bounds: rect(8, 8, 984, -4) })],
      ["non-finite trigger", input({ trigger: rect(NaN, 300, 20, 20) })],
      ["non-finite natural size", input({ naturalSize: { width: 288, height: Infinity } })],
      [
        "non-finite wrappedHeightAt result",
        input({ bounds: rect(8, 8, 200, 784), wrappedHeightAt: () => NaN }),
      ],
      // Finite-degenerate classes (codex R2 F7): a zero/negative measured body
      // means the node was not laid out when measured - place nothing, recover
      // on the next frame like every other hidden cause.
      ["zero natural width", input({ naturalSize: { width: 0, height: 200 } })],
      ["zero natural height", input({ naturalSize: { width: 288, height: 0 } })],
      ["negative natural height", input({ naturalSize: { width: 288, height: -4 } })],
      [
        "zero wrappedHeightAt result",
        input({ bounds: rect(8, 8, 200, 784), wrappedHeightAt: () => 0 }),
      ],
      [
        "negative wrappedHeightAt result",
        input({ bounds: rect(8, 8, 200, 784), wrappedHeightAt: () => -12 }),
      ],
      ["negative trigger width", input({ trigger: rect(500, 300, -20, 20) })],
      ["negative trigger height", input({ trigger: rect(500, 300, 20, -20) })],
      ["negative bounds width", input({ bounds: rect(8, 8, -10, 784) })],
      ["zero bounds height", input({ bounds: rect(8, 8, 984, 0) })],
    ])("%s → hidden", (_name, inp) => {
      expect(computePopoverPlacement(inp)).toEqual({ kind: "hidden" });
    });

    it("partial overlap on each edge still places (positive-area rule)", () => {
      for (const t of [
        rect(0, 300, 20, 20),
        rect(984, 300, 20, 20),
        rect(500, 0, 20, 20),
        rect(500, 784, 20, 20),
      ]) {
        expect(computePopoverPlacement(input({ trigger: t })).kind).toBe("placed");
      }
    });
  });
});

describe("rect helpers", () => {
  it("intersectRects clamps to overlap", () => {
    expect(intersectRects(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toEqual(
      rect(50, 50, 50, 50),
    );
  });
  it("intersectRects on DISJOINT rects yields a non-positive-area rect (codex R2 F7)", () => {
    const i = intersectRects(rect(0, 0, 100, 100), rect(200, 200, 50, 50));
    expect(i.width).toBeLessThanOrEqual(0);
    expect(i.height).toBeLessThanOrEqual(0);
  });
  it("intersectRects on EDGE-TOUCHING rects yields zero width (no positive overlap)", () => {
    const i = intersectRects(rect(0, 0, 100, 100), rect(100, 0, 50, 100));
    expect(i.width).toBe(0);
    expect(i.height).toBe(100);
  });
  it("insetRect shrinks on all four sides", () => {
    expect(insetRect(rect(0, 0, 100, 100), 8)).toEqual(rect(8, 8, 84, 84));
  });
});

describe("caret placement (spec 2026-07-22-hoverhelp-caret-blur-close §3.3)", () => {
  /** Named fixture values every expectation derives from. */
  const BOUNDS = rect(8, 8, 984, 784); // = input() default
  const NATURAL_W = 288; // = input() default naturalSize.width

  // T-C6 - the ONLY place raw caret numbers are pinned.
  it("T-C6: constants pinned", () => {
    expect(CARET_WIDTH).toBe(12);
    expect(CARET_HEIGHT).toBe(GAP);
    expect(CARET_EDGE_INSET).toBe(12 + CARET_WIDTH / 2);
    expect(CARET_INNER_OFFSET).toBe(1.5);
  });

  it("T-C1: unclamped wide trigger - caret center = trigger center; y = trigger.bottom", () => {
    const TRK = rect(500, 300, 60, 20); // wide: half-width 30 > CARET_EDGE_INSET
    const p = computePopoverPlacement(input({ trigger: TRK, align: "left" }));
    if (p.kind !== "placed") throw new Error("expected placed");
    if (p.caret === null) throw new Error("expected caret");
    const center0 = TRK.left + TRK.width / 2;
    // precondition: tracking branch (raw center inside the valid span)
    expect(center0).toBeGreaterThanOrEqual(p.viewport.x + CARET_EDGE_INSET);
    expect(center0).toBeLessThanOrEqual(p.viewport.x + NATURAL_W - CARET_EDGE_INSET);
    expect(p.caret.x).toBe(center0 - CARET_WIDTH / 2);
    expect(p.caret.y).toBe(TRK.bottom);
  });

  it("T-C2: shallow clamp - body slid but raw center still in span tracks exactly", () => {
    const TRK = rect(760, 300, 60, 20);
    const p = computePopoverPlacement(input({ trigger: TRK, align: "left" }));
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    // body slid: align-left x0 would be TRK.left, but bounds clamp it
    expect(p.viewport.x).toBe(BOUNDS.right - NATURAL_W);
    expect(p.viewport.x).not.toBe(TRK.left);
    const center0 = TRK.left + TRK.width / 2;
    // precondition: still the tracking branch
    expect(center0).toBeLessThanOrEqual(p.viewport.x + NATURAL_W - CARET_EDGE_INSET);
    expect(p.caret.x).toBe(center0 - CARET_WIDTH / 2);
  });

  it("T-C2b: deep right-edge clamp pins caret at the far inset", () => {
    const TRK = rect(962, 300, 30, 20);
    const p = computePopoverPlacement(input({ trigger: TRK, align: "left" }));
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.viewport.x).toBe(BOUNDS.right - NATURAL_W);
    const center0 = TRK.left + TRK.width / 2;
    // precondition: raw center OUTSIDE the span -> pinned branch
    expect(center0).toBeGreaterThan(p.viewport.x + NATURAL_W - CARET_EDGE_INSET);
    expect(p.caret.x).toBe(p.viewport.x + NATURAL_W - CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C3: deep left-edge clamp (align right) pins caret at the near inset", () => {
    const TRK = rect(10, 300, 30, 20);
    const p = computePopoverPlacement(input({ trigger: TRK })); // align "right" default
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.viewport.x).toBe(BOUNDS.left);
    const center0 = TRK.left + TRK.width / 2;
    expect(center0).toBeLessThan(p.viewport.x + CARET_EDGE_INSET); // pinned branch
    expect(p.caret.x).toBe(p.viewport.x + CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C4: side top - caret.y = trigger.top - GAP", () => {
    const TRK = rect(500, 700, 60, 20);
    const p = computePopoverPlacement(input({ trigger: TRK, align: "left" }));
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.side).toBe("top");
    expect(p.caret.y).toBe(TRK.top - GAP);
  });

  it("T-C5: degenerate bounds width -> caret null, body still placed", () => {
    const NARROW = rect(490, 8, 2 * CARET_EDGE_INSET - 1, 784); // width 35 < 36
    const p = computePopoverPlacement(
      input({ trigger: rect(500, 300, 20, 20), bounds: NARROW, wrappedHeightAt: () => 200 }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.caret).toBeNull();
  });

  it("T-C5b: boundary effectiveWidth === 2*CARET_EDGE_INSET places the single-point caret", () => {
    const EXACT = rect(490, 8, 2 * CARET_EDGE_INSET, 784); // width 36
    const p = computePopoverPlacement(
      input({ trigger: rect(500, 300, 20, 20), bounds: EXACT, wrappedHeightAt: () => 200 }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.caret.x).toBe(p.viewport.x + CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C5c: natural width < 2*CARET_EDGE_INSET with WIDE bounds -> caret null (guard reads effectiveWidth)", () => {
    const p = computePopoverPlacement(
      input({
        naturalSize: { width: 2 * CARET_EDGE_INSET - 6, height: 200 },
        wrappedHeightAt: () => 200,
      }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.caret).toBeNull();
  });

  it("T-C7: maxWidth active - caret span uses the clamped effectiveWidth, not natural", () => {
    const NARROW = rect(400, 8, 200, 784); // narrower than NATURAL_W -> maxWidth set
    const TRK = rect(580, 300, 20, 20); // center 590: INSIDE the natural-width span, OUTSIDE the effective one
    const p = computePopoverPlacement(
      input({ trigger: TRK, bounds: NARROW, align: "left", wrappedHeightAt: () => 300 }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.maxWidth).toBe(NARROW.width);
    const center0 = TRK.left + TRK.width / 2;
    // preconditions: a wrong implementation using NATURAL_W would TRACK here;
    // the correct effectiveWidth span pins. Both bounds asserted so the
    // fixture cannot drift into a non-discriminating position.
    expect(center0).toBeGreaterThan(p.viewport.x + NARROW.width - CARET_EDGE_INSET);
    expect(center0).toBeLessThanOrEqual(p.viewport.x + NATURAL_W - CARET_EDGE_INSET);
    expect(p.caret.x).toBe(p.viewport.x + NARROW.width - CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C8: hidden placement carries no caret key", () => {
    const p = computePopoverPlacement(
      input({ trigger: rect(-500, -500, 20, 20) }), // no positive overlap with bounds
    );
    expect(p.kind).toBe("hidden");
    expect("caret" in p).toBe(false);
  });
});
