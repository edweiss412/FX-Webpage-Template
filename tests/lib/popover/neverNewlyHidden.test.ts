/**
 * tests/lib/popover/neverNewlyHidden.test.ts
 *
 * THE structural defense for the vector that survived five adversarial rounds.
 *
 * Rounds 1-4 each expressed "zoom must not newly hide a popover" as a boundary
 * condition, and each guess was wrong at a different edge. Round 5's review then
 * showed the first property was VACUOUS on the branch that mattered: `new hidden
 * IMPLIES legacy hidden` says nothing when the result is `placed`, so a fallback
 * returning an arbitrary placed value passed it. It also showed the group labels
 * overclaimed their regimes.
 *
 * So this suite asserts the COMPLETE contract of placeWithinVisibleViewport:
 *
 *   visual-bounds placement is hidden -> result DEEP-EQUALS the legacy placement
 *   otherwise                         -> result DEEP-EQUALS the visual placement
 *
 * and every group carries a NON-VACUITY witness proving it actually reached both
 * regimes rather than concluding through trivial cases. Groups are numbered so a
 * mutation report maps to the regime it exercised.
 */
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
import { placeWithinVisibleViewport } from "@/lib/popover/place";

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const LAYOUT = { w: 1000, h: 800 };
const layoutRect = () => rect(0, 0, LAYOUT.w, LAYOUT.h);

/** A window with NO usable visual viewport (WebKit, missing API, or degenerate). */
const winWithout = (kind: "webkit" | "missing" | "degenerate"): Window =>
  ({
    innerWidth: LAYOUT.w,
    innerHeight: LAYOUT.h,
    CSS: { supports: () => kind === "webkit" },
    visualViewport:
      kind === "missing"
        ? null
        : kind === "degenerate"
          ? { width: 0, height: 0, offsetLeft: 0, offsetTop: 0 }
          : { width: 400, height: 300, offsetLeft: 120, offsetTop: 90 },
  }) as unknown as Window;

/** A non-WebKit window whose visual viewport is the given rect. */
const winWith = (visual: Rect): Window =>
  ({
    innerWidth: LAYOUT.w,
    innerHeight: LAYOUT.h,
    CSS: { supports: () => false },
    visualViewport: {
      width: visual.width,
      height: visual.height,
      offsetLeft: visual.left,
      offsetTop: visual.top,
    },
  }) as unknown as Window;

const baseCore = (trigger: Rect): Omit<PopoverPlacementInput, "bounds"> => ({
  trigger,
  naturalSize: { width: 288, height: 200 },
  wrappedHeightAt: (w: number) => Math.ceil((288 / Math.max(w, 1)) * 200),
  preferredSide: "bottom",
  align: "left",
});

const boundsOf = (viewport: Rect, hostRect: Rect | null): Rect =>
  insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET);

type Witness = {
  total: number;
  fallback: number;
  visual: number;
  legacyPlaced: number;
  /** Round-6 F2: samples that actually reached the regime named in the group title. */
  onRegime: number;
  /** configs where the visual bounds collapsed the core's vertical space */
  verticalGate: number;
  /** configs where the visual composition differs from the layout composition */
  hostComposed: number;
};

const newWitness = (): Witness => ({
  total: 0,
  fallback: 0,
  visual: 0,
  legacyPlaced: 0,
  onRegime: 0,
  verticalGate: 0,
  hostComposed: 0,
});

function checkContract(
  trigger: Rect,
  hostRect: Rect | null,
  visual: Rect,
  label: string,
  w: Witness,
  onRegime?: (t: Rect, v: Rect) => boolean,
): void {
  const core = baseCore(trigger);
  const layoutBounds = boundsOf(layoutRect(), hostRect);
  const visualBounds = boundsOf(visual, hostRect);
  const legacy = computePopoverPlacement({ ...core, bounds: layoutBounds });
  const zoomed = computePopoverPlacement({ ...core, bounds: visualBounds });
  const actual = placeWithinVisibleViewport(winWith(visual), { ...core, hostRect });

  w.total++;
  if (legacy.kind !== "hidden") w.legacyPlaced++;
  if (onRegime?.(trigger, visual) === true) w.onRegime++;
  if (visualBounds.width !== layoutBounds.width || visualBounds.height !== layoutBounds.height) {
    w.hostComposed++;
  }
  // The core hides on collapsed vertical space (position.ts:115); detect that regime.
  const spaceBelow = Math.max(0, visualBounds.bottom - trigger.bottom - GAP);
  const spaceAbove = Math.max(0, trigger.top - visualBounds.top - GAP);
  if (Math.max(spaceAbove, spaceBelow) <= 0) w.verticalGate++;

  if (zoomed.kind === "hidden") {
    w.fallback++;
    // Round-5 F2: the fallback must be TODAY'S COMPLETE ANSWER, not merely "not hidden".
    expect(actual, `${label}: fallback must return the complete legacy placement`).toEqual(legacy);
  } else {
    w.visual++;
    expect(actual, `${label}: non-fallback must return the visual placement`).toEqual(zoomed);
  }

  if (actual.kind === "hidden") {
    expect(legacy.kind, `${label}: zoom NEWLY hid the popover - legacy placed it`).toBe("hidden");
  }
}

/** Round-5 F3: a group only counts if it reached BOTH regimes non-trivially. */
function assertNonVacuous(w: Witness, label: string): void {
  expect(w.fallback, `${label}: no config exercised the FALLBACK regime`).toBeGreaterThan(0);
  expect(w.visual, `${label}: no config exercised the VISUAL regime`).toBeGreaterThan(0);
  expect(w.legacyPlaced, `${label}: every config was legacy-hidden (vacuous)`).toBeGreaterThan(0);
}

/**
 * Round-6 F2: reaching both regimes is NOT the same as reaching the regime the
 * group's TITLE names. A "left edge" group whose samples never approach the left
 * edge would satisfy assertNonVacuous while proving nothing about that edge.
 */
function assertOnRegime(w: Witness, label: string, min = 1): void {
  expect(
    w.onRegime,
    `${label}: no sample reached the regime named in the title`,
  ).toBeGreaterThanOrEqual(min);
}

describe("G0: no usable visual viewport -> the legacy placement, exactly", () => {
  // Round-6 F1: R14's two-arm property omitted this THIRD branch. WebKit (spec
  // R5), a missing API, and degenerate dimensions must each return today's
  // COMPLETE answer, not merely something non-hidden.
  const TRIG = 20;
  for (const kind of ["webkit", "missing", "degenerate"] as const) {
    it(`${kind}: deep-equals the layout-bounds placement`, () => {
      for (const hostRect of [null, rect(80, 120, 400, 300)]) {
        for (const t of [
          rect(400, 76, TRIG, TRIG),
          rect(-10, -10, TRIG, TRIG),
          rect(990, 790, TRIG, TRIG),
        ]) {
          const core = baseCore(t);
          const legacy = computePopoverPlacement({
            ...core,
            bounds: boundsOf(layoutRect(), hostRect),
          });
          const actual = placeWithinVisibleViewport(winWithout(kind), { ...core, hostRect });
          expect(actual, `${kind}: must return the complete legacy placement`).toEqual(legacy);
        }
      }
    });
  }
});

describe("G1-G4: exhaustive edge sweep", () => {
  const visual = rect(100, 150, 200, 180);
  const TRIG = 20;
  const SWEEP = 3 * VIEWPORT_INSET;

  it("G1 left edge, fully-outside through well-inside", () => {
    const w = newWitness();
    for (let o = -TRIG; o <= SWEEP; o++) {
      const t = rect(visual.left - TRIG + o, visual.top + 60, TRIG, TRIG);
      // Regime: the trigger STRADDLES the slice's left edge.
      checkContract(
        t,
        null,
        visual,
        `G1 o=${o}`,
        w,
        (tr, v) => tr.left < v.left && tr.right > v.left,
      );
    }
    assertNonVacuous(w, "G1 left edge");
    assertOnRegime(w, "G1 left edge");
  });

  it("G2 right edge", () => {
    const w = newWitness();
    for (let o = -TRIG; o <= SWEEP; o++) {
      const t = rect(visual.right - o, visual.top + 60, TRIG, TRIG);
      checkContract(
        t,
        null,
        visual,
        `G2 o=${o}`,
        w,
        (tr, v) => tr.left < v.right && tr.right > v.right,
      );
    }
    assertNonVacuous(w, "G2 right edge");
    assertOnRegime(w, "G2 right edge");
  });

  it("G3 top edge", () => {
    const w = newWitness();
    for (let o = -TRIG; o <= SWEEP; o++) {
      const t = rect(visual.left + 60, visual.top - TRIG + o, TRIG, TRIG);
      checkContract(
        t,
        null,
        visual,
        `G3 o=${o}`,
        w,
        (tr, v) => tr.top < v.top && tr.bottom > v.top,
      );
    }
    assertNonVacuous(w, "G3 top edge");
    assertOnRegime(w, "G3 top edge");
  });

  it("G4 bottom edge", () => {
    const w = newWitness();
    for (let o = -TRIG; o <= SWEEP; o++) {
      const t = rect(visual.left + 60, visual.bottom - o, TRIG, TRIG);
      checkContract(
        t,
        null,
        visual,
        `G4 o=${o}`,
        w,
        (tr, v) => tr.top < v.bottom && tr.bottom > v.bottom,
      );
    }
    assertNonVacuous(w, "G4 bottom edge");
    assertOnRegime(w, "G4 bottom edge");
  });
});

describe("G5: the core's vertical-space gate", () => {
  it("triggers that collapse spaceAbove AND spaceBelow inside the slice", () => {
    const w = newWitness();
    const TRIG = 20;
    for (let h = 2 * VIEWPORT_INSET + 2; h <= 2 * VIEWPORT_INSET + 2 * GAP + TRIG + 10; h += 2) {
      const slice = rect(100, 150, 240, h);
      const inner = insetRect(slice, VIEWPORT_INSET);
      const top = inner.top + Math.max(0, Math.floor((inner.height - TRIG) / 2));
      checkContract(rect(slice.left + 60, top, TRIG, TRIG), null, slice, `G5 h=${h}`, w);
    }
    assertNonVacuous(w, "G5 vertical gate");
    expect(w.verticalGate, "G5 never reached the collapsed-vertical-space regime").toBeGreaterThan(
      0,
    );
  });
});

describe("G6: narrow slices (width-driven, NOT the CSS irreducible box)", () => {
  it("narrow visible slices drive the width path", () => {
    // NOTE: the pure core has no padding/border information, so this group cannot
    // and does not claim to exercise the R9 irreducible-box behavior - that is a
    // DOM fact, pinned in the component and e2e layers instead (round-5 F3).
    const w = newWitness();
    const TRIG = 20;
    // Starts BELOW 2*VIEWPORT_INSET so the inset collapses the bounds entirely
    // and the fallback regime is genuinely reached; the witness below caught an
    // earlier range that only ever produced placed results (round-5 F3's exact
    // failure mode, detected by the mechanism it demanded).
    for (let width = 2; width <= 160; width += 2) {
      const slice = rect(100, 150, width, 300);
      const t = rect(slice.left + Math.floor(width / 2), slice.top + 80, TRIG, TRIG);
      checkContract(
        t,
        null,
        slice,
        `G6 w=${width}`,
        w,
        (_tr, v) => v.width - 2 * VIEWPORT_INSET <= 0,
      );
    }
    assertNonVacuous(w, "G6 narrow slices");
    assertOnRegime(w, "G6 narrow slices");
  });
});

describe("G7: panel-host composition", () => {
  const visual = rect(100, 150, 200, 180);
  const TRIG = 20;

  it("host intersect visible controls the answer, and the composition is exercised", () => {
    const w = newWitness();
    const hosts = [
      rect(80, 120, 400, 300), // larger than the slice
      rect(90, 140, 60, 50), // smaller than the slice
      rect(250, 300, 200, 200), // offset, partially overlapping
      rect(0, 0, 900, 700), // ~ whole page
    ];
    for (const host of hosts) {
      for (let o = -TRIG; o <= 2 * VIEWPORT_INSET; o += 2) {
        const t = rect(visual.left - TRIG + o, visual.top + 60, TRIG, TRIG);
        checkContract(t, host, visual, `G7 host=${host.left},${host.top} o=${o}`, w);
      }
    }
    assertNonVacuous(w, "G7 panel hosts");
    expect(
      w.hostComposed,
      "G7 never produced bounds differing from the layout composition",
    ).toBeGreaterThan(0);
  });
});

describe("G8: deterministic randomized sweep", () => {
  /** Mulberry32 - reproducible, so any failure is replayable by seed. */
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it("2000 coherent configurations, with declared ranges and non-vacuity floors", () => {
    const w = newWitness();
    const r = rng(20260725);
    const pick = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo));
    const distinct = {
      config: new Set<string>(),
      visualW: new Set<number>(),
      visualH: new Set<number>(),
      triggerX: new Set<number>(),
      triggerY: new Set<number>(),
      hostKinds: new Set<string>(),
    };
    for (let i = 0; i < 2000; i++) {
      // Slices are always coherent and positive-area; sizes span from just above
      // the inset up to most of the page, so both regimes are reachable.
      const visual = rect(
        pick(0, 600),
        pick(0, 500),
        pick(2 * VIEWPORT_INSET + 1, 500),
        pick(2 * VIEWPORT_INSET + 1, 450),
      );
      const trigger = rect(pick(-40, 900), pick(-40, 700), pick(4, 60), pick(4, 60));
      const hostRect =
        r() < 0.5 ? null : rect(pick(0, 600), pick(0, 500), pick(40, 600), pick(40, 500));
      distinct.config.add(JSON.stringify([visual, trigger, hostRect]));
      distinct.visualW.add(visual.width);
      distinct.visualH.add(visual.height);
      distinct.triggerX.add(trigger.left);
      distinct.triggerY.add(trigger.top);
      distinct.hostKinds.add(hostRect === null ? "body" : "panel");
      checkContract(trigger, hostRect, visual, `G8 i=${i}`, w);
    }
    assertNonVacuous(w, "G8 randomized");
    // Floors, so a generator change that quietly collapses coverage fails here.
    expect(w.fallback, "G8 fallback coverage floor").toBeGreaterThan(50);
    expect(w.visual, "G8 visual coverage floor").toBeGreaterThan(50);
    expect(w.legacyPlaced, "G8 legacy-placed floor").toBeGreaterThan(200);
    // Round-6 F2: counts alone cannot detect a COLLAPSED generator - repeating
    // three fixed configs thousands of times satisfies every count above. These
    // assert the generator actually varies along each axis it claims to vary.
    expect(
      distinct.config.size,
      "G8 generator collapsed: too few distinct configurations",
    ).toBeGreaterThan(1500);
    expect(distinct.visualW.size, "G8 slice WIDTH axis collapsed").toBeGreaterThan(100);
    expect(distinct.visualH.size, "G8 slice HEIGHT axis collapsed").toBeGreaterThan(100);
    expect(distinct.triggerX.size, "G8 trigger X axis collapsed").toBeGreaterThan(200);
    expect(distinct.triggerY.size, "G8 trigger Y axis collapsed").toBeGreaterThan(200);
    expect(distinct.hostKinds.size, "G8 must generate BOTH body-host and panel-host cases").toBe(2);
  });
});
