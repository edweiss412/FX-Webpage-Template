/**
 * tests/lib/popover/viewport.test.ts
 *
 * Spec 2026-07-24-hoverhelp-visual-viewport §4.1 guard table, one case per row.
 * No jsdom: these functions take the window as a parameter precisely so they
 * run against plain object stubs with no global mutation.
 *
 * The "which bounds do we use" decision does NOT live here — it lives in
 * lib/popover/place.ts and is covered by the property suite in
 * tests/lib/popover/neverNewlyHidden.test.ts. This file only pins what the two
 * rects ARE.
 */
import { describe, expect, it } from "vitest";
import {
  isVisualViewportEngine,
  layoutViewportRect,
  visualViewportRect,
} from "@/lib/popover/viewport";

type VvStub = { width: number; height: number; offsetLeft: number; offsetTop: number };

function makeWin(opts: {
  innerWidth?: number;
  innerHeight?: number;
  vv?: VvStub | null;
  webkit?: boolean;
  css?: "absent" | "no-supports" | "present";
}): Window {
  const css = opts.css ?? "present";
  const carrier: Record<string, unknown> = {
    innerWidth: opts.innerWidth ?? 390,
    innerHeight: opts.innerHeight ?? 780,
    visualViewport: opts.vv ?? null,
  };
  if (css === "present") carrier["CSS"] = { supports: (): boolean => opts.webkit === true };
  else if (css === "no-supports") carrier["CSS"] = {};
  return carrier as unknown as Window;
}

const LAYOUT = { left: 0, top: 0, width: 390, height: 780, right: 390, bottom: 780 };
const VV: VvStub = { width: 156, height: 312, offsetLeft: 117, offsetTop: 234 };

describe("layoutViewportRect (T-U1)", () => {
  it("is the layout viewport at the client origin", () => {
    expect(layoutViewportRect(makeWin({ vv: null }))).toEqual(LAYOUT);
  });

  it("is unaffected by the presence of a visual viewport", () => {
    expect(layoutViewportRect(makeWin({ vv: VV }))).toEqual(LAYOUT);
  });
});

describe("visualViewportRect - absent API (T-U1)", () => {
  it("null visualViewport -> null", () => {
    expect(visualViewportRect(makeWin({ vv: null }))).toBeNull();
  });

  it("undefined visualViewport -> null", () => {
    const w = { innerWidth: 390, innerHeight: 780 } as unknown as Window;
    expect(visualViewportRect(w)).toBeNull();
  });
});

describe("visualViewportRect - non-WebKit (T-U2)", () => {
  it("takes size from the visual viewport and origin from its offsets", () => {
    expect(visualViewportRect(makeWin({ vv: VV }))).toEqual({
      left: 117,
      top: 234,
      width: 156,
      height: 312,
      right: 273,
      bottom: 546,
    });
  });

  it("keeps right/bottom consistent with left+width and top+height", () => {
    const r = visualViewportRect(
      makeWin({ vv: { width: 111.4, height: 222.9, offsetLeft: 124.3, offsetTop: 258.6 } }),
    );
    expect(r).not.toBeNull();
    expect(r?.right).toBeCloseTo((r?.left ?? 0) + (r?.width ?? 0), 10);
    expect(r?.bottom).toBeCloseTo((r?.top ?? 0) + (r?.height ?? 0), 10);
  });
});

describe("visualViewportRect - WebKit is excluded (T-U3)", () => {
  it("returns null on WebKit, so callers use the layout viewport", () => {
    expect(visualViewportRect(makeWin({ vv: VV, webkit: true }))).toBeNull();
  });

  it("the same input on a non-WebKit engine DOES yield a rect - the branch is load-bearing", () => {
    expect(visualViewportRect(makeWin({ vv: VV, webkit: false }))).not.toBeNull();
  });
});

describe("visualViewportRect - degenerate dimensions (T-U4)", () => {
  const cases: [string, VvStub][] = [
    ["NaN width", { ...VV, width: Number.NaN }],
    ["Infinity height", { ...VV, height: Number.POSITIVE_INFINITY }],
    ["zero width", { ...VV, width: 0 }],
    ["negative height", { ...VV, height: -1 }],
  ];
  for (const [name, vv] of cases) {
    it(`${name} -> null, never a degenerate bounds`, () => {
      expect(visualViewportRect(makeWin({ vv }))).toBeNull();
    });
  }
});

describe("visualViewportRect - degenerate offsets (T-U5)", () => {
  it("coerces non-finite offsets to 0 while keeping the visual size", () => {
    expect(
      visualViewportRect(makeWin({ vv: { ...VV, offsetLeft: Number.NaN, offsetTop: Number.NaN } })),
    ).toEqual({ left: 0, top: 0, width: 156, height: 312, right: 156, bottom: 312 });
  });
});

describe("visualViewportRect - missing CSS.supports (T-U6)", () => {
  it("an absent CSS global is not WebKit", () => {
    expect(visualViewportRect(makeWin({ vv: VV, css: "absent" }))?.left).toBe(117);
  });

  it("a CSS without supports() is not WebKit", () => {
    expect(visualViewportRect(makeWin({ vv: VV, css: "no-supports" }))?.left).toBe(117);
  });
});

describe("visualViewportRect - unzoomed equality (T-U7)", () => {
  it("equals the layout rect when the visual viewport equals it", () => {
    const w = makeWin({ vv: { width: 390, height: 780, offsetLeft: 0, offsetTop: 0 } });
    expect(visualViewportRect(w)).toEqual(layoutViewportRect(w));
  });
});

describe("visualViewportRect - scrollbar-shaped difference at scale 1 (T-U8)", () => {
  it("prefers the visible width when a scrollbar gutter makes it narrower", () => {
    const r = visualViewportRect(
      makeWin({
        innerWidth: 1280,
        innerHeight: 720,
        vv: { width: 1265, height: 720, offsetLeft: 0, offsetTop: 0 },
      }),
    );
    // Spec R7: bounding by the genuinely visible area is ratified behavior here.
    expect(r?.width).toBe(1265);
  });
});

describe("isVisualViewportEngine - subscription is not a usability question (T-U10 / R13)", () => {
  it("degenerate dimensions STILL qualify the engine, so a recovery resize can arrive", () => {
    const degenerate = makeWin({ vv: { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 } });
    expect(isVisualViewportEngine(degenerate)).toBe(true);
    // ...while the rect itself is unusable right now.
    expect(visualViewportRect(degenerate)).toBeNull();
  });

  it("WebKit never qualifies", () => {
    expect(isVisualViewportEngine(makeWin({ vv: VV, webkit: true }))).toBe(false);
  });

  it("no visualViewport never qualifies", () => {
    expect(isVisualViewportEngine(makeWin({ vv: null }))).toBe(false);
  });
});
