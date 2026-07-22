# HoverHelp Smart Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal the shared HoverHelp popover into a positioning host (modal panel or document.body) with collision-aware, pure-function placement, closing `BL-HOVERHELP-PORTAL` and `WARNCARD-POPOVER-OVERLAP-1`.

**Architecture:** All placement algebra lives in a pure exported function (`lib/popover/position.ts`, pattern: `lib/layout/fitWithinClip.ts`); `HoverHelp` becomes a thin shell that measures rects, calls the function, and applies inline coordinates; `ReviewModalShell` provides the one `PopoverHostContext` site. Spec: `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md` (round-7 APPROVE) — the spec is canonical wherever this plan is silent.

**Tech Stack:** React 19.2.4, TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest + RTL (jsdom), Playwright standalone harness (esbuild 0.28.0 + Tailwind CLI), GitHub Actions.

## Global Constraints

- Spec §1.1 R1-R9 are ratified — do not revisit (no positioning library; layout-viewport posture; mounted-gate; etc.).
- `GAP = 6`, `VIEWPORT_INSET = 8` — exported from `lib/popover/position.ts`, pinned by equality tests.
- Every height/width in the core is a BORDER-BOX `getBoundingClientRect` measurement with class caps active (§4.2 metric contract). `scrollHeight` appears nowhere in the core.
- Body classes keep `w-72 max-w-[80vw] max-h-[min(60vh,24rem)] overflow-y-auto` and closed-state `hidden` (scrollWidth fix). Positioning classes `absolute z-50` stay; the side/`calc` classes and `right-0`/`left-0` are REPLACED by inline `top`/`left`.
- Testids unchanged: `<testId>-trigger`, `<testId>-body`, `rootTestId`.
- No `Date.now()`-style nondeterminism in tests; timers via `vi.useFakeTimers()` where needed.
- Commit per task, conventional commits, `--no-verify` (worktree lacks hook env), scope `crew-page`-style: use `feat(admin)` / `test(admin)` / `infra:` as fitting.
- Meta-test inventory (spec §6): EXTENDS `hoverHelpEscapeContainment.test.tsx`; no new registries; declared inapplicable: Supabase/advisory-lock/catalog/sentinel/mutation registries.
- UI files touched ⇒ impeccable v3 dual-gate (critique + audit) BEFORE cross-model whole-diff review (invariant 8).

---

### Task 1: Pure positioning core

**Files:**
- Create: `lib/popover/position.ts`
- Test: `tests/lib/popover/position.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2-3 and e2e): `GAP: 6`, `VIEWPORT_INSET: 8`, `type Rect`, `type PopoverPlacementInput`, `type PopoverPlacement`, `computePopoverPlacement(input): PopoverPlacement`, `intersectRects(a: Rect, b: Rect): Rect`, `insetRect(r: Rect, by: number): Rect`.

- [ ] **Step 1: Write the failing test file** — `tests/lib/popover/position.test.ts`:

```ts
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
    const right = computePopoverPlacement(input({ align: "left", trigger: rect(970, 300, 20, 20) }));
    if (right.kind !== "placed") throw new Error("expected placed");
    expect(right.viewport.x).toBe(992 - 288); // bounds.right − width
  });

  it("width === bounds.width boundary places with no maxWidth", () => {
    const p = computePopoverPlacement(input({ bounds: rect(8, 8, 288, 784), trigger: rect(60, 300, 20, 20) }));
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.maxWidth).toBeNull();
  });

  describe("hidden gate", () => {
    it.each<[string, PopoverPlacementInput]>([
      ["zero-area trigger (zero width)", input({ trigger: rect(500, 300, 0, 20) })],
      ["zero-area trigger (zero height)", input({ trigger: rect(500, 300, 20, 0) })],
      ["trigger fully outside bounds", input({ trigger: rect(2000, 300, 20, 20) })],
      ["trigger touching edge, zero overlap area", input({ trigger: rect(992, 300, 20, 20) })],
      ["trigger spanning bounds vertically (both spaces 0)", input({ trigger: rect(500, 8, 20, 784) })],
      ["degenerate bounds (zero width)", input({ bounds: rect(8, 8, 0, 784) })],
      ["degenerate bounds (negative height)", input({ bounds: rect(8, 8, 984, -4) })],
      ["non-finite trigger", input({ trigger: rect(NaN, 300, 20, 20) })],
      ["non-finite natural size", input({ naturalSize: { width: 288, height: Infinity } })],
      ["non-finite wrappedHeightAt result", input({ bounds: rect(8, 8, 200, 784), wrappedHeightAt: () => NaN })],
    ])("%s → hidden", (_name, inp) => {
      expect(computePopoverPlacement(inp)).toEqual({ kind: "hidden" });
    });

    it("partial overlap on each edge still places (positive-area rule)", () => {
      for (const t of [rect(0, 300, 20, 20), rect(984, 300, 20, 20), rect(500, 0, 20, 20), rect(500, 784, 20, 20)]) {
        expect(computePopoverPlacement(input({ trigger: t })).kind).toBe("placed");
      }
    });
  });
});

describe("rect helpers", () => {
  it("intersectRects clamps to overlap", () => {
    expect(intersectRects(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toEqual(rect(50, 50, 50, 50));
  });
  it("insetRect shrinks on all four sides", () => {
    expect(insetRect(rect(0, 0, 100, 100), 8)).toEqual(rect(8, 8, 84, 84));
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/lib/popover/position.test.ts` → FAIL (module not found `@/lib/popover/position`).

- [ ] **Step 3: Implement** — `lib/popover/position.ts`:

```ts
/**
 * lib/popover/position.ts - pure placement algebra for the HoverHelp popover
 * (spec docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md §4.2).
 *
 * ALL placement math lives here (structural defense: two adversarial rounds
 * found ordering/state defects in prose math - the ordering below is pinned
 * by tests/lib/popover/position.test.ts and cannot drift per-call-site).
 * The component shell only measures rects and applies the returned values.
 * Pattern precedent: lib/layout/fitWithinClip.ts.
 *
 * Metric contract: every width/height is a rendered BORDER-BOX measurement
 * (getBoundingClientRect) taken with the body's class caps ACTIVE.
 * scrollHeight appears nowhere in this contract.
 */

export const GAP = 6; // trigger↔body gap, px (was `calc(100%+6px)`)
export const VIEWPORT_INSET = 8; // min distance from bounds edges, px

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type PopoverPlacementInput = {
  /** Trigger button rect, viewport coords. */
  trigger: Rect;
  /** Body border-box size with NO inline constraints (class caps active). */
  naturalSize: { width: number; height: number };
  /** Body BORDER-BOX height at a forced width (class max-height cap active). */
  wrappedHeightAt: (width: number) => number;
  /** intersect(hostRect, viewportRect) inset by VIEWPORT_INSET. */
  bounds: Rect;
  preferredSide: "top" | "bottom";
  align: "left" | "right";
};

export type PopoverPlacement =
  | { kind: "hidden" }
  | {
      kind: "placed";
      side: "top" | "bottom";
      viewport: { x: number; y: number };
      maxHeight: number | null;
      maxWidth: number | null;
    };

export function intersectRects(a: Rect, b: Rect): Rect {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function insetRect(r: Rect, by: number): Rect {
  return {
    left: r.left + by,
    top: r.top + by,
    right: r.right - by,
    bottom: r.bottom - by,
    width: r.width - 2 * by,
    height: r.height - 2 * by,
  };
}

const finiteRect = (r: Rect): boolean =>
  Number.isFinite(r.left) &&
  Number.isFinite(r.top) &&
  Number.isFinite(r.width) &&
  Number.isFinite(r.height) &&
  Number.isFinite(r.right) &&
  Number.isFinite(r.bottom);

/** Positive-area overlap - touching edges do NOT count (spec §4.2 step 1). */
const overlapsPositively = (a: Rect, b: Rect): boolean => {
  const i = intersectRects(a, b);
  return i.width > 0 && i.height > 0;
};

const HIDDEN: PopoverPlacement = { kind: "hidden" };

export function computePopoverPlacement(input: PopoverPlacementInput): PopoverPlacement {
  const { trigger, naturalSize, bounds, preferredSide, align } = input;

  // ---- step 1: degenerate/hidden gate (spec §4.2 step 1) ----
  if (!finiteRect(trigger) || !finiteRect(bounds)) return HIDDEN;
  if (!Number.isFinite(naturalSize.width) || !Number.isFinite(naturalSize.height)) return HIDDEN;
  if (bounds.width <= 0 || bounds.height <= 0) return HIDDEN;
  if (trigger.width <= 0 || trigger.height <= 0) return HIDDEN; // zero-area trigger
  if (!overlapsPositively(trigger, bounds)) return HIDDEN;
  const spaceBelow = Math.max(0, bounds.bottom - trigger.bottom - GAP);
  const spaceAbove = Math.max(0, trigger.top - bounds.top - GAP);
  if (Math.max(spaceAbove, spaceBelow) <= 0) return HIDDEN; // trigger spans bounds vertically

  // ---- step 2: width first (spec §4.2 step 2) ----
  const maxWidth = naturalSize.width > bounds.width ? bounds.width : null;
  const effectiveWidth = Math.min(naturalSize.width, bounds.width);
  const height0 = maxWidth === null ? naturalSize.height : input.wrappedHeightAt(effectiveWidth);
  if (!Number.isFinite(height0)) return HIDDEN; // non-finite wrappedHeightAt result

  // ---- step 3: vertical side (spec §4.2 step 3; ties → preferredSide) ----
  const space = (side: "top" | "bottom"): number => (side === "top" ? spaceAbove : spaceBelow);
  const other: "top" | "bottom" = preferredSide === "top" ? "bottom" : "top";
  let side: "top" | "bottom";
  let maxHeight: number | null = null;
  if (height0 <= space(preferredSide)) side = preferredSide;
  else if (height0 <= space(other)) side = other;
  else {
    side = space(preferredSide) >= space(other) ? preferredSide : other; // tie → preferred
    maxHeight = space(side);
  }
  const effectiveHeight = Math.min(height0, space(side));
  const y = side === "bottom" ? trigger.bottom + GAP : trigger.top - GAP - effectiveHeight;

  // ---- step 4: horizontal (spec §4.2 step 4) ----
  let x = align === "right" ? trigger.right - effectiveWidth : trigger.left;
  x = Math.min(Math.max(x, bounds.left), bounds.right - effectiveWidth);

  return { kind: "placed", side, viewport: { x, y }, maxHeight, maxWidth };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/lib/popover/position.test.ts` → all pass.
- [ ] **Step 5: Typecheck** — `pnpm exec tsc --noEmit` → clean.
- [ ] **Step 6: Commit** — `git add lib/popover/position.ts tests/lib/popover/position.test.ts && git commit --no-verify -m "feat(admin): pure popover placement core with decision-table suite"`

---

### Task 2: Portal + host context + provider (topology only, coordinates static)

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Modify: `components/admin/HoverHelp.tsx` (portal + context; positioning shell comes in Task 3)
- Modify: `components/admin/review/ReviewModalShell.tsx` (one provider line pair)
- Test: `tests/components/admin/hoverHelpEscapeContainment.test.tsx` (extend), `tests/components/admin/HoverHelp.test.tsx` (adjust)

**Interfaces:**
- Produces: `export const PopoverHostContext: Context<RefObject<HTMLElement | null> | null>` from `components/admin/HoverHelp.tsx` (consumed by ReviewModalShell in this task; by tests throughout).
- Consumes: nothing from Task 1 yet.

- [ ] **Step 1: Write failing topology tests** — append to `tests/components/admin/hoverHelpEscapeContainment.test.tsx` (T1 iv/v; the existing two Escape tests stay untouched and must stay green):

```tsx
test("body is a DESCENDANT of the dialog panel when the host context is provided (spec §4.1)", async () => {
  render(<Harness onClose={() => {}} />);
  const body = await screen.findByTestId("hover-help-body");
  const panel = document.querySelector('[role="dialog"]');
  expect(panel).not.toBeNull();
  expect(panel!.contains(body)).toBe(true);
});

test("body portals to document.body when NO host context is provided", async () => {
  render(
    <HoverHelp label="Help: solo" testId="solo-help">
      <p>solo body</p>
    </HoverHelp>,
  );
  const body = await screen.findByTestId("solo-help-body");
  expect(body.parentElement).toBe(document.body);
});

test("Escape ORIGINATING inside the portaled body still contains (R1 F5)", async () => {
  const onClose = vi.fn();
  render(<HarnessWithLearnMore onClose={onClose} />);
  fireEvent.click(await screen.findByTestId("hover-help-trigger"));
  const link = await screen.findByRole("link", { name: /learn more/i });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  await waitFor(() =>
    expect(screen.getByTestId("hover-help-trigger")).toHaveAttribute("aria-expanded", "false"),
  );
  expect(onClose).not.toHaveBeenCalled();
});
```

`HarnessWithLearnMore` = copy of the existing `Harness` with `learnMore={{ href: "/help/x" }}` on its `<HoverHelp>`. Note `findByTestId` (async): the portal mounts after the mounted-gate effect.

- [ ] **Step 2: Run** — `pnpm vitest run tests/components/admin/hoverHelpEscapeContainment.test.tsx` → new tests FAIL (body is in-flow; no portal).

- [ ] **Step 3: Implement portal + context in `HoverHelp.tsx`.** Changes:

```tsx
// imports: add
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import type { Context, RefObject } from "react";

/**
 * Positioning host for portaled popovers (spec §4.1). Provided by
 * ReviewModalShell (the ONE dialog site - every HoverHelp-bearing dialog
 * composes it). Body portals into the host panel; without a provider,
 * document.body.
 */
export const PopoverHostContext: Context<RefObject<HTMLElement | null> | null> =
  createContext<RefObject<HTMLElement | null> | null>(null);
```

Inside the component:

```tsx
const hostRef = useContext(PopoverHostContext);
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []); // mounted-gate (ReviewModalShell.tsx:710 pattern)
```

The body `<div … >` (the existing :242-274 block) moves into a variable `popoverBody` unchanged EXCEPT its className keeps `absolute z-50 …` but drops the two `calc` side classes and `right-0`/`left-0` (Task 3 adds inline coords; in this task the body renders with `top`/`left` unset — topology tests don't assert geometry). Render:

```tsx
{mounted
  ? createPortal(popoverBody, hostRef?.current ?? document.body)
  : null}
```

The root wrapper div keeps `rootTestId`, handlers, and gains `aria-owns={bodyId}` (spec §4.4 SR-order mitigation).

- [ ] **Step 4: Provider in `ReviewModalShell.tsx`** — wrap the panel's CHILDREN (inside the panel div at :618, so `panelRef.current` is the host):

```tsx
<PopoverHostContext.Provider value={panelRef}>{children}</PopoverHostContext.Provider>
```

with `import { PopoverHostContext } from "@/components/admin/HoverHelp";` (client-to-client import; ReviewModalShell is `"use client"`).

- [ ] **Step 5: Run** — `pnpm vitest run tests/components/admin/hoverHelpEscapeContainment.test.tsx` → ALL pass (old two + new three). Then `pnpm vitest run tests/components/admin/HoverHelp.test.tsx` — fix the `within(root)` body assertions (:140-142) to:

```tsx
const root = screen.getByTestId("help-affordance--x--tooltip");
expect(within(root).getByTestId("x-help-trigger")).toBeInTheDocument();
const body = await screen.findByTestId("x-help-body"); // portaled: document scope
expect(body.parentElement).toBe(document.body);
expect(root).toHaveAttribute("aria-owns", body.id);
```

Sweep the rest of the suite for any other wrapper-scoped body queries in the same pass (class-sweep rule) and convert identically. All 12 green.

- [ ] **Step 6: Typecheck + commit** — `pnpm exec tsc --noEmit`; `git add -A && git commit --no-verify -m "feat(admin): portal HoverHelp body into PopoverHostContext host with mounted gate"`

---

### Task 3: Positioning shell + reposition lifecycle

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Modify: `components/admin/HoverHelp.tsx`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Test: Create `tests/components/admin/hoverHelpLifecycle.test.tsx` (spec T7-unit u1-u7)

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces: data attribute `data-popover-side="top" | "bottom"` on the body while placed (e2e hooks read it), `data-popover-hidden="true"` while anchor-gone.

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- [ ] **Step 1: Write failing lifecycle tests** — `tests/components/admin/hoverHelpLifecycle.test.tsx`:

```tsx
/**
 * Spec §4.3 lifecycle contract (u1-u7). jsdom: all rects are zero, so the
 * placement result is always `hidden` - these tests assert SCHEDULING and
 * CLEANUP mechanics only, never geometry (spec §4.8 jsdom row).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HoverHelp } from "@/components/admin/HoverHelp";

type FrameCb = (t: number) => void;
let frames: Map<number, FrameCb>;
let nextId: number;
let cancelled: number[];
let observed: Element[];
let unobserved: Element[];

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  cancelled = [];
  observed = [];
  unobserved = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCb): number => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    cancelled.push(id);
    frames.delete(id);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(el: Element) { observed.push(el); }
      unobserve(el: Element) { unobserved.push(el); }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const runPendingFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(0);
};

function mount() {
  render(
    <HoverHelp label="Help: lifecycle" testId="lc">
      <p>body</p>
    </HoverHelp>,
  );
  return screen.getByTestId("lc-trigger");
}

test("u3: open measures synchronously - no frame requested by the open path", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  expect(frames.size).toBe(0);
});

test("u4: scroll while CLOSED requests no frame", () => {
  mount();
  fireEvent.scroll(window);
  expect(frames.size).toBe(0);
});

test("u5: coalescing - many scrolls, one frame; id cleared after run", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.scroll(window);
  fireEvent.scroll(window);
  fireEvent.scroll(window);
  expect(frames.size).toBe(1);
  runPendingFrames();
  fireEvent.scroll(window);
  expect(frames.size).toBe(1); // a NEW frame could be scheduled → id was cleared
});

test("u1: close with a frame pending cancels it", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.scroll(window);
  expect(frames.size).toBe(1);
  const pendingId = [...frames.keys()][0];
  fireEvent.click(trigger); // toggle closed
  expect(cancelled).toContain(pendingId);
});

test("u2: unmount with a frame pending cancels it without error", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.scroll(window);
  const pendingId = [...frames.keys()][0];
  cleanup();
  expect(cancelled).toContain(pendingId);
});

test("u6: trigger button and body and host are observed while open", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  const body = screen.getByTestId("lc-body");
  expect(observed).toContain(trigger);
  expect(observed).toContain(body);
  expect(observed).toContain(document.body); // host (no provider → body)
});

test("u7: close detaches observations", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(unobserved.length).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Run** — FAIL (no scheduling machinery exists).

- [ ] **Step 3: Implement the shell in `HoverHelp.tsx`:**

```tsx
// imports: add
import { useLayoutEffect } from "react";
import {
  GAP,
  VIEWPORT_INSET,
  computePopoverPlacement,
  insetRect,
  intersectRects,
  type Rect,
} from "@/lib/popover/position";

const toRect = (r: DOMRect): Rect => ({
  left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom,
});
```

Component internals (after the existing `open` state):

```tsx
const triggerRef = useRef<HTMLButtonElement | null>(null);
const bodyRef = useRef<HTMLDivElement | null>(null);
const frameRef = useRef<number | null>(null);

/** Measure + apply (spec §4.2 shell steps a-d). Runs only while open. */
const measureAndApply = () => {
  const trigger = triggerRef.current;
  const body = bodyRef.current;
  if (!trigger || !body) return;
  const host = hostRef?.current ?? document.body;
  // (a) clear previous inline constraints so measurement is natural
  body.style.maxHeight = "";
  body.style.maxWidth = "";
  const hostRect = toRect(host.getBoundingClientRect());
  const viewportRect: Rect = {
    left: 0, top: 0, width: window.innerWidth, height: window.innerHeight,
    right: window.innerWidth, bottom: window.innerHeight,
  };
  const bounds = insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET);
  const naturalRect = body.getBoundingClientRect();
  const placement = computePopoverPlacement({
    trigger: toRect(trigger.getBoundingClientRect()),
    naturalSize: { width: naturalRect.width, height: naturalRect.height },
    wrappedHeightAt: (w) => {
      body.style.maxWidth = `${w}px`;
      const h = body.getBoundingClientRect().height; // border-box, caps active
      body.style.maxWidth = "";
      return h;
    },
    bounds,
    preferredSide: placementProp,
    align,
  });
  if (placement.kind === "hidden") {
    body.style.visibility = "hidden";
    body.dataset["popoverHidden"] = "true";
    return;
  }
  body.style.visibility = "";
  delete body.dataset["popoverHidden"];
  body.dataset["popoverSide"] = placement.side;
  // (d) convert viewport point to host offsets (spec §4.2 host formulas)
  const isBodyHost = host === document.body;
  const left = isBodyHost
    ? placement.viewport.x + window.scrollX
    : placement.viewport.x - hostRect.left - host.clientLeft;
  const top = isBodyHost
    ? placement.viewport.y + window.scrollY
    : placement.viewport.y - hostRect.top - host.clientTop;
  body.style.left = `${left}px`;
  body.style.top = `${top}px`;
  if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
  if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;
};

/** Coalescer: no-op if a frame is pending or closed (spec §4.3). */
const schedule = () => {
  if (!open || frameRef.current !== null) return;
  frameRef.current = requestAnimationFrame(() => {
    frameRef.current = null; // cleared BEFORE running so re-entrant events can schedule
    measureAndApply();
  });
};

// (a) open → synchronous pre-paint measurement; NOT via schedule()
useLayoutEffect(() => {
  if (!open) return;
  measureAndApply();
  const host = hostRef?.current ?? document.body;
  const trigger = triggerRef.current;
  const body = bodyRef.current;
  window.addEventListener("scroll", schedule, { capture: true, passive: true }); // (b)
  window.addEventListener("resize", schedule); // (c)
  const ro = new ResizeObserver(schedule); // (d): trigger + body + host
  if (trigger) ro.observe(trigger);
  if (body) ro.observe(body);
  ro.observe(host);
  return () => {
    window.removeEventListener("scroll", schedule, { capture: true });
    window.removeEventListener("resize", schedule);
    if (trigger) ro.unobserve(trigger);
    if (body) ro.unobserve(body);
    ro.unobserve(host);
    ro.disconnect();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open]);
```

`placementProp` = rename of the destructured `placement = "bottom"` prop (`placement: placementProp = "bottom"`), so the placement RESULT name stays free. `triggerRef` attaches to BOTH trigger button variants; `bodyRef` to the body div. NOTE the rename means the body className side-ternary from :249 is deleted in the same edit (already dropped in Task 2).

- [ ] **Step 4: Run lifecycle suite** — green. Also re-run Task 2 suites — still green.
- [ ] **Step 5: Typecheck + full unit sweep** — `pnpm exec tsc --noEmit && pnpm vitest run tests/components/admin` → green (consumer suites may fail here → fix per Task 5 scope ONLY if trivially the portal-location class; otherwise leave for Task 5).
- [ ] **Step 6: Commit** — `git commit --no-verify -am "feat(admin): collision-aware positioning shell with rAF-coalesced reposition lifecycle"`

---

### Task 4: Keyboard — Tab bridge (body host), focusin keep-open

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Modify: `components/admin/HoverHelp.tsx`
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Test: extend `tests/components/admin/hoverHelpLifecycle.test.tsx` with a `describe("tab bridge")` block (jsdom behavioral part of spec T8)

**Interfaces:** none new.

- [ ] **Step 1: Failing tests:**

```tsx
describe("tab bridge (body host only, learnMore set - spec §4.5)", () => {
  function mountWithLink() {
    render(
      <HoverHelp label="Help: bridge" testId="br" learnMore={{ href: "/help/x" }}>
        <p>body</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("br-trigger");
    fireEvent.click(trigger);
    const link = screen.getByRole("link", { name: /learn more/i });
    return { trigger, link };
  }

  test("Tab on trigger moves focus to the link and clears a pending close timer", () => {
    vi.useFakeTimers();
    const { trigger, link } = mountWithLink();
    // stage a pending hover-close (mouse leave), then Tab within the 120ms window
    fireEvent.pointerLeave(trigger.closest("div")!, { pointerType: "mouse" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(document.activeElement).toBe(link);
    vi.advanceTimersByTime(300); // past CLOSE_DELAY_MS
    expect(trigger).toHaveAttribute("aria-expanded", "true"); // timer was cleared
    vi.useRealTimers();
  });

  test("Tab on link closes popover and returns focus to trigger (declared double-visit)", () => {
    const { trigger, link } = mountWithLink();
    link.focus();
    fireEvent.keyDown(link, { key: "Tab" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  test("Shift+Tab on link returns focus to trigger, popover stays open", () => {
    const { trigger, link } = mountWithLink();
    link.focus();
    fireEvent.keyDown(link, { key: "Tab", shiftKey: true });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(trigger);
  });

  test("focusin on the body clears a pending close timer", () => {
    vi.useFakeTimers();
    const { trigger, link } = mountWithLink();
    fireEvent.pointerLeave(trigger.closest("div")!, { pointerType: "mouse" });
    fireEvent.focusIn(link);
    vi.advanceTimersByTime(300);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in `HoverHelp.tsx` (bridge active only when `host === document.body` — check `hostRef === null` since the provider is the only non-body source — AND `open` AND `learnMore`):

```tsx
const linkRef = useRef<HTMLAnchorElement | null>(null);

const onTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
  if (e.key !== "Tab" || e.shiftKey || hostRef !== null || !open || !learnMore) return;
  e.preventDefault();
  clearCloseTimer(); // pending hover-close must not hide the newly focused link
  linkRef.current?.focus();
};

const onBodyKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
  if (e.key !== "Tab" || hostRef !== null || !learnMore) return;
  if (document.activeElement !== linkRef.current) return;
  e.preventDefault();
  if (e.shiftKey) {
    triggerRef.current?.focus(); // popover stays open
  } else {
    clearCloseTimer();
    setOpen(false); // declared double-visit semantics (§4.5)
    triggerRef.current?.focus();
  }
};

const onBodyFocusIn = () => clearCloseTimer(); // §4.5 focus keeps it open
```

Wire: `onKeyDown={onTriggerKeyDown}` merged into `triggerProps`; body div gets `onKeyDown={onBodyKeyDown}` and `onFocus={onBodyFocusIn}` (React's onFocus delegates focusin), `ref={linkRef}` on the learnMore `<a>`.

- [ ] **Step 4: Run — green. Step 5: typecheck. Step 6: Commit** — `git commit --no-verify -am "feat(admin): body-host tab bridge and focus keep-open for portaled popover"`

---

### Task 5: Blast radius — consumer suites, snapshot, walker

**Files:**
- Modify (only where queries break): `tests/components/admin/Dashboard.test.tsx`, `ShowsTable.test.tsx`, `RecentAutoAppliedStrip.test.tsx`, `tests/components/admin/settings/AdministratorsSection.test.tsx`, `tests/components/admin/settings/DriveConnectionPanel.test.tsx`, `tests/app/admin/settingsHeader.test.tsx`, `tests/app/admin/needsAttentionPage.test.tsx`, `tests/components/admin/hoverHelpCompactTrigger.test.tsx`, `tests/components/admin/stagedCardBaseline.test.tsx` snapshot, `tests/e2e/deep-link-walker.spec.ts`
- No production files.

**Interfaces:** none.

- [ ] **Step 1: Run the seven consumer suites + compactTrigger + stagedCardBaseline** — `pnpm vitest run tests/components/admin tests/app/admin` and list failures. Expected failure class: body queries scoped through a wrapper (`within(...)`) now empty; body assertions needing `await` (mounted-gate).
- [ ] **Step 2: Fix each failing query** to document scope (`screen.findByTestId(...)`), asserting portal location where the old assertion was structural. Do NOT weaken assertions: where a suite asserted body CONTENT under the wrapper, keep the content assertion at document scope.
- [ ] **Step 3: Regenerate the outerHTML snapshot** — `pnpm vitest run tests/components/admin/stagedCardBaseline.test.tsx -u`; inspect the diff: the ONLY delta must be the popover body div's departure from the card subtree. Any other delta = Task 2/3 regression; stop and fix there.
- [ ] **Step 4: deep-link-walker HoverHelp arm** (`tests/e2e/deep-link-walker.spec.ts:182-199`): after clicking the trigger, locate the link via the body testid at DOCUMENT scope — replace the nested-descendant search with: read the trigger's `aria-controls` id, `page.locator("#" + CSS.escape(id))`, then find the link inside THAT node. (Runs in Task 8's CI verification; only edited here.)
- [ ] **Step 5: Full unit suite** — `pnpm vitest run` → green. Typecheck. Commit — `git commit --no-verify -am "test(admin): document-scope popover queries across consumer suites for portaled body"`

---

### Task 6: Geometry e2e — standalone harness + workflow

**Files:**
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- Create: `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`, `tests/e2e/hoverhelp-geometry.spec.ts`, `.github/workflows/hoverhelp-geometry-e2e.yml`
- Modify: `tests/e2e/standalone.config.ts` (testMatch allow-list :29-35), `.github/workflows/published-modal-e2e.yml` (`paths:` += `components/admin/HoverHelp.tsx`, `lib/popover/position.ts`)

**Interfaces:**
- Consumes: `data-popover-side` / `data-popover-hidden` hooks (Task 3), exported constants (Task 1).
- Harness template: `tests/e2e/compact-alert-card-layout.spec.ts` (esbuild bundle via the `_step3ReviewModalBundle.mjs` pattern, Tailwind CLI CSS with `@source` entries for HoverHelp + the entry, `node:http` ephemeral-port server, hydration sentinel div `data-testid="harness-ready"` rendered in a post-mount effect).

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
**Entry fixtures** (`_hoverHelpGeometryLiveEntry.tsx` mounts real `<HoverHelp>` instances at controlled offsets, driven by `?case=` query param):
- `top`: trigger at y≈80 (fits below)
- `bottom`: trigger at `viewportHeight − 60` (flips up)
- `center-tall`: centered trigger + 1200px-tall popover content (shrink case)
- `overflow`: content long enough that caps engage (T3d)
- `capped-fit`: content sized so `scrollHeight > spaceBelow` but border-box (capped) height ≤ spaceBelow (T3h) — fixture asserts BOTH preconditions at runtime and throws if violated
- `preferred-top`: `placement="top"` instance mid-page + another pinned at y≈40
- `edges`: `align="right"` trigger at x≈10 and `align="left"` trigger at right edge
- `scrolly`: page 3000px tall, trigger at y≈1500 (body-host coordinate probe under scroll)
- `pane`: a 300px `overflow-y-auto` container hosting a card list (anchor-gone + tracking)
- `learnmore`: body-host learnMore instance (T8 body-host keyboard)

<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- [ ] **Step 1: Write the failing spec** — `tests/e2e/hoverhelp-geometry.spec.ts` case list (each opens the popover by clicking the trigger, waits for `harness-ready`, then asserts; all expected values derived from live `getBoundingClientRect` of trigger/bounds + imported `GAP`/`VIEWPORT_INSET`):
  - T3a: `case=top` → `bodyRect.top ≈ triggerRect.bottom + GAP` (±0.5), `data-popover-side="bottom"`.
  - T3b: `case=bottom` → `bodyRect.bottom ≈ triggerRect.top − GAP` (±0.5); body within `[VIEWPORT_INSET, innerWidth−VIEWPORT_INSET] × [VIEWPORT_INSET, innerHeight−VIEWPORT_INSET]`.
  - T3c: `case=center-tall` → body within bounds; `maxHeight` inline ≈ larger space (±0.5); `scrollHeight > clientHeight` on the body.
  - T3d matrix: viewports 1280×800 (width === 288 ±0.5, height === 384 ±0.5), 320×844 (width === 0.8×320 = 256 ±0.5), 1280×500 (height === 300 ±0.5). Expected values computed from `page.viewportSize()`, not literals.
  - T3e: `case=pane` → scroll pane so trigger exits → `data-popover-hidden="true"` + `visibility: hidden`; scroll back → visible, `aria-expanded` still true.
  - T3f: `case=preferred-top` → mid-page instance opens top (`bodyRect.bottom ≈ triggerRect.top − GAP`); pinned instance opens bottom (`bodyRect.top ≈ triggerRect.bottom + GAP`).
  - T3g: narrow-host panel case lives in Task 7 (real modal); here assert `case=edges` clamping: both bodies within horizontal bounds (±0.5).
  - T3h: `case=capped-fit` → `data-popover-side="bottom"` and NO inline maxHeight.
  - T5: `case=bottom` fixture card carries a guidance band div — assert no rect intersection between body and band.
  - T6-open: at 390×844, open each case → `document.documentElement.scrollWidth === clientWidth`. T6-scroll: `case=scrolly` scrolled to 1200 → T3a gap equation holds against viewport rects (catches a broken scrollY term).
  - T7-e2e: `case=pane` scroll by 40px → body offset to trigger preserved (±1) after `page.waitForTimeout(50)`; `case=center-tall` grow-content button (+400px) → repositioned within bounds; viewport resize 1280→900 wide → re-clamped. maxWidth/maxHeight RESTORATION: shrink viewport then restore → inline constraint cleared.
  - T8 body-host: `case=learnmore` — Tab from trigger → link focused (with staged pending close: hover, move away, Tab within 120ms, then wait 300ms → still visible); Tab from link → popover closed + focus on trigger; Shift+Tab → trigger focused + still open.
- [ ] **Step 2: Add the spec to `standalone.config.ts` testMatch** (allow-list) and run — `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts` → FAILS (entry doesn't exist yet) → build entry + bundle script wiring until the suite runs and PASSES.
<!-- spec-lint: ignore — new files created by this plan; not yet tracked -->
- [ ] **Step 3: Workflow** — `.github/workflows/hoverhelp-geometry-e2e.yml`, patterned on `attention-anchor-e2e.yml` (same pinned Playwright container + pnpm steps + `workflow_dispatch:`), `paths:` exactly: the spec, the entry, `components/admin/HoverHelp.tsx`, `lib/popover/position.ts`, `components/admin/review/ReviewModalShell.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/compactAlertHelp.tsx`, `components/admin/CompactAlertCard.tsx`, `tests/e2e/standalone.config.ts`, `app/globals.css`, and the workflow file itself. Invocation line: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts`.
- [ ] **Step 4: `published-modal-e2e.yml` paths** += `components/admin/HoverHelp.tsx`, `lib/popover/position.ts` (spec §6 CI wiring).
- [ ] **Step 5: Commit** — `git commit --no-verify -am "test(admin): hoverhelp geometry standalone e2e suite + dedicated workflow"`

---

### Task 7: Modal-family e2e — clipping, inert, panel-host lifecycle/keyboard

**Files:**
- Modify: `tests/e2e/published-review-modal.interactions.spec.ts` (append a `test.describe("hoverhelp panel host")` block)

**Interfaces:** consumes the modal harness already in that spec (server boot, seeded show, modal-open helpers — reuse its existing `beforeAll`/fixtures verbatim).

- [ ] **Step 1: Write failing cases:**
  - T4a clipping kill-shot: open the modal, scroll the attention pane (`ShowReviewSurface` `overflow-y-auto` pane) so an alert card sits at the pane's bottom edge, click its help trigger; assert `document.elementFromPoint` at body center + 4 inset corners returns the body or a descendant (`elementFromPoint` via `page.evaluate`; coords from the body's viewport rect; reference memory: `reference_playwright_elementfrompoint_viewport_coords` — viewport coords, not page coords).
  - T4b inert: begin modal dismiss (Escape with popover closed); during the exit transition assert `body.closest('[inert]') !== null` WHENEVER `panel.closest('[inert]') !== null` (sample both in one `evaluate` so they cannot tear).
  - T7 panel-host: shrink viewport width so the panel narrows below 288px content → popover `maxWidth` engages, body within panel bounds (T3g's panel arm); pane scroll tracking ±1px.
  - T8 panel-host: with popover open, repeatedly Tab and collect `document.activeElement` testids for a full cycle — assert the learn-more link appears in the cycle AND wrap still occurs (first element reached again).
- [ ] **Step 2: Run** — `pnpm exec playwright test tests/e2e/published-review-modal.interactions.spec.ts --project=desktop-chromium` (needs the port-3000 webServer per the spec's harness; if the suite's own boot docs differ, follow the file header) → new cases FAIL only if Tasks 2-4 mis-implemented; fix in the producing task, not here.
- [ ] **Step 3: Commit** — `git commit --no-verify -am "test(admin): panel-host clipping, inert, and keyboard e2e in review-modal family"`

---

### Task 8: Bookkeeping + gates

**Files:**
- Modify: `DEFERRED.md` (remove WARNCARD-POPOVER-OVERLAP-1 → move full entry to `DEFERRED-archive.md`), `BACKLOG.md` (mark `BL-HOVERHELP-PORTAL` resolved; add `BL-HOVERHELP-VISUAL-VIEWPORT` per spec R8)

- [ ] **Step 1: Bookkeeping edits** (archive entry gets a "SHIPPED via 2026-07-22-hoverhelp-smart-position" line; backlog addition cites spec §1.1 R8).
- [ ] **Step 2: Implementation-time class-sweep** (spec §4.1): `grep -rln 'role="dialog"' components/ | xargs grep -ln "ShowReviewSurface\|HoverHelp\|CompactAlertHelp\|PerShowActionableWarnings\|AttentionBanner"` → every hit must be a ReviewModalShell consumer or carry the provider; paste output into the PR body.
- [ ] **Step 3: Pre-push gates** (memories: full suite, typecheck, eslint, format): `pnpm vitest run && pnpm exec tsc --noEmit && pnpm lint && pnpm format:check` → all green.
- [ ] **Step 4: Impeccable dual-gate** (invariant 8): `/impeccable critique` + `/impeccable audit` on the diff (UI files: HoverHelp.tsx, ReviewModalShell.tsx). P0/P1 fixed or DEFERRED.md'd. Record findings + dispositions.
- [ ] **Step 5: Commit** — `git commit --no-verify -am "docs: close WARNCARD-POPOVER-OVERLAP-1 and BL-HOVERHELP-PORTAL; file visual-viewport backlog"`

---

### Task 9: Ship

- [ ] Whole-diff cross-model review (split tight-scope briefs via codex-guard, inlined + tool-free per this session's working recipe) → APPROVE.
- [ ] Push branch; open PR (body: spec link, probe summary, class-sweep output, impeccable dispositions, `🤖 Generated with [Claude Code](https://claude.com/claude-code)` footer + session link).
- [ ] Real CI green (all required checks + the new `hoverhelp-geometry-e2e` via `workflow_dispatch` if path filters didn't fire it).
- [ ] `gh pr merge --merge` in the same turn as CI-green; fast-forward main; verify `git rev-list --left-right --count main...origin/main` → `0  0`.
- [ ] Stage 4.4: CronDelete the hourly nudge job; set ship-state `stage: "done"`.
