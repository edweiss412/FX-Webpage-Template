import { describe, expect, it } from "vitest";
import {
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
  it("insetRect shrinks on all four sides", () => {
    expect(insetRect(rect(0, 0, 100, 100), 8)).toEqual(rect(8, 8, 84, 84));
  });
});
