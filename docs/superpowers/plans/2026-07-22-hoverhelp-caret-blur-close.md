# HoverHelp Caret + Blur-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the always-on popover caret (pure-core math) and pair-scoped blur-close per spec `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md` (cross-model APPROVED R4), un-deferring `HOVERHELP-CLAMP-CARET-1`.

**Architecture:** Caret geometry is a step-5 extension of `computePopoverPlacement` in `lib/popover/position.ts` (all algebra in the pure core); the shell renders a sibling caret node in the existing portal and applies core output via the shared host-conversion path. Blur-close is one `onBlur` handler on the root wrapper (probe §4.0 P2: portal blurs bubble through the React tree), gated off for the modal-host+`learnMore` quadrant.

**Tech Stack:** React 19, Tailwind v4 (data-attribute variants), Vitest + jsdom, Playwright standalone config.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md`. §1.1 decisions are non-relitigable.
- TDD per task: failing test → minimal implementation → green → commit (`feat(admin)` / `test(admin)` scopes; core work uses `feat(admin)` — the popover is an admin surface).
- Constants: `CARET_WIDTH = 12`, `CARET_HEIGHT = 6` (= `GAP`), `CARET_EDGE_INSET = 18`, `CARET_INNER_OFFSET = 1.5` — defined ONCE in `lib/popover/position.ts`; tests import them (raw numeric pins only in the constants-pin test).
- No em-dashes in user-visible copy (no new copy is added by this feature; caret is aria-hidden).
- UI surface → invariant 8: impeccable critique + audit dual-gate before cross-model close-out review (Task 6).
- Meta-test inventory: NONE of the candidate registries applies (Supabase boundaries, sentinel hiding, alert catalog, advisory locks, inline email) — pure client geometry + focus handling; no advisory-lock surface (`pg_advisory*` untouched); no mutation surface (invariant 10 N/A — no route/server-action changes).
- Layout-dimensions task: N/A — no fixed-dimension parent with flex/grid children (spec §7); geometric invariants are positional and covered by the e2e task's rect-delta assertions in a real browser.
- Test wiring (verified): new/extended jsdom files under `tests/components/admin/` auto-run via `BASE_INCLUDE` (`vitest.projects.ts:34`) + parallel glob (`vitest.projects.ts:65`); `tests/lib/popover/position.test.ts` already included; `.github/workflows/hoverhelp-geometry-e2e.yml` path-triggers on `lib/popover/position.ts` + `components/admin/HoverHelp.tsx` (lines 21-22) so the e2e gate fires on this PR unchanged.

---

### Task 1: Caret math in the pure core

**Files:**
- Modify: `lib/popover/position.ts` (constants block near line 16; `PopoverPlacement` type at 41-49; `computePopoverPlacement` return path at 120-127)
- Test: `tests/lib/popover/position.test.ts` (extend)

**Interfaces:**
- Produces: exports `CARET_WIDTH: 12`, `CARET_HEIGHT: 6`, `CARET_EDGE_INSET: 18`, `CARET_INNER_OFFSET: 1.5`; placed variant gains `caret: { x: number; y: number } | null` (viewport coords of the caret box top-left). Tasks 2 and 4 consume all of these.

- [ ] **Step 1: Write the failing tests** — append to `tests/lib/popover/position.test.ts` (inside the file's top-level scope, after the existing describes; the `input()`/`rect()` helpers at lines 12-32 are in scope). Import additions to the existing import block: `CARET_WIDTH, CARET_HEIGHT, CARET_EDGE_INSET, CARET_INNER_OFFSET`.

```ts
describe("caret placement (spec 2026-07-22-hoverhelp-caret-blur-close §3.3)", () => {
  // T-C6 - the ONLY place raw caret numbers are pinned.
  it("T-C6: constants pinned", () => {
    expect(CARET_WIDTH).toBe(12);
    expect(CARET_HEIGHT).toBe(GAP);
    expect(CARET_EDGE_INSET).toBe(12 + CARET_WIDTH / 2);
    expect(CARET_INNER_OFFSET).toBe(1.5);
  });

  // Wide trigger so the raw center is inside the valid span (a 20px trigger's
  // center is always inside CARET_EDGE_INSET of a flush-aligned body edge, so
  // tracking needs width >= 2*CARET_EDGE_INSET when flush-aligned).
  it("T-C1: unclamped wide trigger - caret center = trigger center; y = trigger.bottom", () => {
    const p = computePopoverPlacement(
      input({ trigger: rect(500, 300, 60, 20), align: "left" }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    if (p.caret === null) throw new Error("expected caret");
    // x = trigger.left = 500; center0 = 530; span [500+18, 500+288-18] contains 530
    expect(p.caret.x).toBe(530 - CARET_WIDTH / 2);
    expect(p.caret.y).toBe(320);
  });

  it("T-C2: shallow clamp - body slid but raw center still in span tracks exactly", () => {
    // Trigger near right bounds edge: align left x0 = 760 -> clamp to 992-288=704.
    // center0 = 760+30 = 790; span [704+18, 704+288-18] = [722, 974] contains 790.
    const p = computePopoverPlacement(
      input({ trigger: rect(760, 300, 60, 20), align: "left" }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.viewport.x).toBe(704);
    expect(p.caret.x).toBe(790 - CARET_WIDTH / 2);
  });

  it("T-C2b: deep right-edge clamp pins caret at far inset", () => {
    // Trigger hugging the right bounds edge: x clamps to 704; center0 = 962+15=977
    // exceeds span max 704+288-18 = 974 -> pinned.
    const p = computePopoverPlacement(
      input({ trigger: rect(962, 300, 30, 20), align: "left" }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.viewport.x).toBe(704);
    expect(p.caret.x).toBe(704 + 288 - CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C3: deep left-edge clamp (align right) pins caret at near inset", () => {
    // align right: x0 = trigger.right - 288 = 40-288 < 8 -> clamp to 8.
    // center0 = 10+15 = 25 < 8+18 = 26 -> pinned at 26.
    const p = computePopoverPlacement(input({ trigger: rect(10, 300, 30, 20) }));
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.viewport.x).toBe(8);
    expect(p.caret.x).toBe(8 + CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C4: side top - caret.y = trigger.top - GAP", () => {
    const p = computePopoverPlacement(input({ trigger: rect(500, 700, 60, 20), align: "left" }));
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.side).toBe("top");
    expect(p.caret.y).toBe(700 - GAP);
  });

  it("T-C5: degenerate bounds width -> caret null, body still placed", () => {
    const p = computePopoverPlacement(
      input({
        trigger: rect(500, 300, 20, 20),
        bounds: rect(490, 8, 35, 784),
        wrappedHeightAt: () => 200,
      }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.caret).toBeNull();
  });

  it("T-C5b: boundary effectiveWidth === 36 places the single-point caret", () => {
    const p = computePopoverPlacement(
      input({
        trigger: rect(500, 300, 20, 20),
        bounds: rect(490, 8, 36, 784),
        wrappedHeightAt: () => 200,
      }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    // x clamps into [490, 526-36=490]; center = 490 + 18 (single valid point)
    expect(p.caret.x).toBe(490 + CARET_EDGE_INSET - CARET_WIDTH / 2);
  });

  it("T-C5c: natural width < 36 with WIDE bounds -> caret null (guard reads effectiveWidth)", () => {
    const p = computePopoverPlacement(
      input({ naturalSize: { width: 30, height: 200 }, wrappedHeightAt: () => 200 }),
    );
    if (p.kind !== "placed") throw new Error("expected placed");
    expect(p.caret).toBeNull();
  });

  it("T-C7: maxWidth active - caret span uses the clamped effectiveWidth", () => {
    // bounds narrower than natural 288 -> maxWidth set, effectiveWidth = 200.
    const p = computePopoverPlacement(
      input({
        trigger: rect(500, 300, 20, 20),
        bounds: rect(400, 8, 200, 784),
        wrappedHeightAt: () => 300,
      }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.maxWidth).toBe(200);
    // x clamps into [400, 600-200=400]; center0 = 510; span [418, 582] contains 510
    expect(p.caret.x).toBe(510 - CARET_WIDTH / 2);
  });

  it("T-C8: hidden placement carries no caret key", () => {
    const p = computePopoverPlacement(
      input({ trigger: rect(-500, -500, 20, 20) }), // no positive overlap with bounds
    );
    expect(p.kind).toBe("hidden");
    expect("caret" in p).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/lib/popover/position.test.ts`
Expected: FAIL — `CARET_WIDTH` has no export (TS/compile error surfaces as test failure).

- [ ] **Step 3: Implement.** In `lib/popover/position.ts`:

After the `VIEWPORT_INSET` export (line 17), add:

```ts
export const CARET_WIDTH = 12; // triangle base, px
export const CARET_HEIGHT = 6; // = GAP - the caret exactly fills the trigger-body gap
// Min distance from a body edge to the caret CENTER: 12 mirrors --radius-md
// (app/globals.css) so the triangle base sits on the straight edge run, never
// a rounded corner.
export const CARET_EDGE_INSET = 12 + CARET_WIDTH / 2;
// Vertical inset of the inner (fill) triangle from the outer (border)
// triangle; also the seam overhang over the body border. Shell + tests share it.
export const CARET_INNER_OFFSET = 1.5;
```

Extend the placed variant of `PopoverPlacement`:

```ts
export type PopoverPlacement =
  | { kind: "hidden" }
  | {
      kind: "placed";
      side: "top" | "bottom";
      viewport: { x: number; y: number };
      maxHeight: number | null;
      maxWidth: number | null;
      /** Caret box top-left, viewport coords; null when the body is too
       *  narrow to seat the triangle on a straight edge (spec §3.3). */
      caret: { x: number; y: number } | null;
    };
```

Replace the final return (line 127) with step 5 + return:

```ts
  // ---- step 5: caret (spec 2026-07-22-hoverhelp-caret-blur-close §3.3) ----
  let caret: { x: number; y: number } | null = null;
  if (effectiveWidth >= 2 * CARET_EDGE_INSET) {
    const caretCenterX0 = trigger.left + trigger.width / 2;
    const caretCenterX = Math.min(
      Math.max(caretCenterX0, x + CARET_EDGE_INSET),
      x + effectiveWidth - CARET_EDGE_INSET,
    );
    caret = {
      x: caretCenterX - CARET_WIDTH / 2,
      y: side === "bottom" ? trigger.bottom : trigger.top - GAP,
    };
  }

  return { kind: "placed", side, viewport: { x, y }, maxHeight, maxWidth, caret };
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run tests/lib/popover/position.test.ts`
Expected: PASS (all existing decision-table tests remain green — the placed object only GAINED a key).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

```bash
git add lib/popover/position.ts tests/lib/popover/position.test.ts
git commit --no-verify -m "feat(admin): caret placement math in popover position core"
```

---

### Task 2: Shell caret rendering

**Files:**
- Modify: `components/admin/HoverHelp.tsx` (imports; `measureAndApply` 215-284; layout effect cleanup 310-327; portal 503-555)
- Test: `tests/components/admin/hoverHelpLifecycle.test.tsx` (extend — T-J1..T-J6)

**Interfaces:**
- Consumes: Task 1's `caret` field + `CARET_INNER_OFFSET` (class literals in this task must equal the constant; a comment ties them).
- Produces: portal renders body div THEN caret div (`data-testid` `` `${testId}-caret` ``); caret carries `data-popover-side` when placed; Task 4's e2e reads `-caret` and its inner child.

- [ ] **Step 1: Write the failing tests** — append to the `measure-and-apply with stubbed rects` describe in `tests/components/admin/hoverHelpLifecycle.test.tsx` (helpers `stubRect`, `stubViewport`, `mount`, `PaneHarness`, `runPendingFrames` are in scope; fixture math mirrors the existing body-host conversion test at lines 177-191):

```ts
  test("T-J1/T-J6: caret node - structure, aria, classes, closed state", () => {
    mount();
    const body = screen.getByTestId("lc-body");
    const caret = screen.getByTestId("lc-caret");
    // T-J6a portal order: body THEN caret (caret paints over the seam)
    expect(body.nextElementSibling).toBe(caret);
    // T-J6b exactly one inner (fill) triangle element
    expect(caret.children).toHaveLength(1);
    expect(caret.getAttribute("aria-hidden")).toBe("true");
    // T-J6d class parity with the body's open/close + transition tokens
    for (const token of [
      "transition-[opacity,display]",
      "duration-fast",
      "transition-discrete",
      "starting:opacity-0",
      "hidden",
      "z-50",
      "pointer-events-none",
    ]) {
      expect(caret.className).toContain(token);
    }
    expect(caret.className).not.toContain("block"); // closed
  });

  test("T-J6c: placed caret mirrors the body's data-popover-side and positions from core output", () => {
    stubViewport(1000, 800);
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 250 });
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: -250, width: 1000, height: 3000 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(caret.getAttribute("data-popover-side")).toBe("bottom");
    expect(body.getAttribute("data-popover-side")).toBe("bottom");
    // core: x = trigger.left = 500 (align left default, no clamp);
    // center0 = 510 < 500+CARET_EDGE_INSET -> pinned at 518; caret.x = 512.
    // body-host conversion adds scrollY: top = trigger.bottom(320) + 250 = 570.
    expect(caret.style.left).toBe(`${500 + CARET_EDGE_INSET - CARET_WIDTH / 2}px`);
    expect(caret.style.top).toBe(`${320 + 250}px`);
  });

  test("T-J2: collision-hidden hides a previously visible caret with the body", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(caret.style.visibility).toBe("");
    stubRect(trigger, { left: 500, top: -900, width: 20, height: 20 }); // out of bounds
    fireEvent.scroll(window);
    runPendingFrames();
    expect(body.style.visibility).toBe("hidden");
    expect(caret.style.visibility).toBe("hidden");
    expect(caret.hasAttribute("data-popover-side")).toBe(false);
  });

  test("T-J3: placed result with caret:null hides the caret alone", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    // trigger at viewport left edge; body naturally 30px wide -> effectiveWidth 30 < 36
    stubRect(trigger, { left: 100, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 30, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(body.style.visibility).toBe(""); // body visible
    expect(caret.style.visibility).toBe("hidden"); // caret suppressed
  });

  test("T-J4: pane-host caret conversion applies host offsets like the body", () => {
    stubViewport(1000, 800);
    render(<PaneHarness />);
    const trigger = screen.getByTestId("ph-trigger");
    const pane = screen.getByTestId("pane-host");
    Object.defineProperty(pane, "scrollTop", { configurable: true, value: 120 });
    Object.defineProperty(pane, "scrollLeft", { configurable: true, value: 40 });
    Object.defineProperty(pane, "clientTop", { configurable: true, value: 0 });
    Object.defineProperty(pane, "clientLeft", { configurable: true, value: 0 });
    stubRect(pane, { left: 100, top: 100, width: 400, height: 300 });
    stubRect(trigger, { left: 150, top: 150, width: 20, height: 20 });
    const body = screen.getByTestId("ph-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 100 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("ph-caret");
    // core: x = 150; center0 = 160 < 150+18 -> pinned 168; caret.x = 162; caret.y = trigger.bottom = 170
    // host conversion: left = 162 - 100 + 40 = 102; top = 170 - 100 + 120 = 190
    expect(caret.style.left).toBe(`${162 - 100 + 40}px`);
    expect(caret.style.top).toBe(`${170 - 100 + 120}px`);
  });

  test("T-J5: close resets caret attribute lifecycle", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(caret.getAttribute("data-popover-side")).toBe("bottom");
    fireEvent.click(trigger); // close
    expect(caret.hasAttribute("data-popover-side")).toBe(false);
    expect(caret.style.visibility).toBe("");
  });
```

Import additions to the test file's import block: `import { CARET_EDGE_INSET, CARET_WIDTH } from "@/lib/popover/position";`

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpLifecycle.test.tsx`
Expected: FAIL — `getByTestId("lc-caret")` finds nothing.

- [ ] **Step 3: Implement** in `components/admin/HoverHelp.tsx`:

(a) Extend the position import (line 60-66):

```ts
import {
  CARET_INNER_OFFSET,
  VIEWPORT_INSET,
  computePopoverPlacement,
  insetRect,
  intersectRects,
  type Rect,
} from "@/lib/popover/position";
```

(b) Add `const caretRef = useRef<HTMLDivElement | null>(null);` next to `bodyRef` (line 158).

(c) In `measureAndApply`, extract a shared converter and apply the caret. Replace the placed-branch application block (lines 268-283) with:

```ts
    body.style.visibility = "";
    delete body.dataset["popoverHidden"];
    if (open) linkRef.current?.setAttribute("tabindex", "0"); // visible again
    body.dataset["popoverSide"] = placement.side;
    // (d) convert viewport point to host offsets (spec §4.2 host formulas);
    // shared by body and caret so the two paths cannot drift.
    const isBodyHostEl = host === document.body;
    const toHostOffsets = (pt: { x: number; y: number }) => ({
      left: isBodyHostEl
        ? pt.x + window.scrollX
        : pt.x - hostRect.left - host.clientLeft + host.scrollLeft,
      top: isBodyHostEl
        ? pt.y + window.scrollY
        : pt.y - hostRect.top - host.clientTop + host.scrollTop,
    });
    const bodyOffsets = toHostOffsets(placement.viewport);
    body.style.left = `${bodyOffsets.left}px`;
    body.style.top = `${bodyOffsets.top}px`;
    if (placement.maxHeight !== null) body.style.maxHeight = `${placement.maxHeight}px`;
    if (placement.maxWidth !== null) body.style.maxWidth = `${placement.maxWidth}px`;
    // Caret (spec 2026-07-22-hoverhelp-caret-blur-close §3.4): sibling node,
    // same coordinate space; suppressed alone when the core returns null.
    const caret = caretRef.current;
    if (caret) {
      if (placement.caret === null) {
        caret.style.visibility = "hidden";
        delete caret.dataset["popoverSide"];
      } else {
        caret.style.visibility = "";
        caret.dataset["popoverSide"] = placement.side;
        const caretOffsets = toHostOffsets(placement.caret);
        caret.style.left = `${caretOffsets.left}px`;
        caret.style.top = `${caretOffsets.top}px`;
      }
    }
```

(d) In the hidden branch (lines 251-266), after the body writes add:

```ts
      const caretEl = caretRef.current;
      if (caretEl) {
        caretEl.style.visibility = "hidden";
        delete caretEl.dataset["popoverSide"];
      }
```

(e) In the layout-effect cleanup (lines 321-326), extend the attribute-lifecycle reset:

```ts
      if (body) {
        delete body.dataset["popoverSide"];
        delete body.dataset["popoverHidden"];
        body.style.visibility = "";
      }
      const caretEl = caretRef.current;
      if (caretEl) {
        delete caretEl.dataset["popoverSide"];
        caretEl.style.visibility = "";
      }
```

(f) Portal: wrap the body div in a fragment and append the caret AFTER it (before the closing of `createPortal`). The caret div (outer = border triangle, inner = fill triangle; orientation via Tailwind data-attribute variants reacting to the imperative `data-popover-side` write; `group` on the outer lets the inner follow):

```tsx
          <>
            {/* existing body div, UNCHANGED, then: */}
            <div
              ref={caretRef}
              aria-hidden="true"
              data-testid={`${testId}-caret`}
              /* CARET_INNER_OFFSET = 1.5px is the literal in the inner's
                 top/bottom classes below - lib/popover/position.ts owns it. */
              className={`group absolute z-50 h-0 w-0 pointer-events-none border-x-[6px] border-x-transparent transition-[opacity,display] duration-fast transition-discrete starting:opacity-0 data-[popover-side=bottom]:border-b-[6px] data-[popover-side=bottom]:border-b-border-strong data-[popover-side=bottom]:border-t-0 data-[popover-side=top]:border-t-[6px] data-[popover-side=top]:border-t-border-strong data-[popover-side=top]:border-b-0 ${
                open ? "block opacity-100" : "hidden opacity-0"
              }`}
            >
              <div
                aria-hidden="true"
                className="absolute left-[-6px] h-0 w-0 border-x-[6px] border-x-transparent group-data-[popover-side=bottom]:top-[1.5px] group-data-[popover-side=bottom]:border-b-[6px] group-data-[popover-side=bottom]:border-b-surface-raised group-data-[popover-side=bottom]:border-t-0 group-data-[popover-side=top]:bottom-[1.5px] group-data-[popover-side=top]:border-t-[6px] group-data-[popover-side=top]:border-t-surface-raised group-data-[popover-side=top]:border-b-0"
              />
            </div>
          </>
```

Note: apex-down inner uses `bottom-[1.5px]`, NOT a negative top — the absolute child's containing block is the outer's padding box, displaced 6px down by `border-top` (spec §3.4).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpLifecycle.test.tsx tests/components/admin/HoverHelp.test.tsx tests/components/admin/hoverHelpCompactTrigger.test.tsx tests/components/admin/hoverHelpAfterBody.test.tsx tests/components/admin/hoverHelpEscapeContainment.test.tsx`
Expected: PASS (new + all existing HoverHelp suites).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` — clean.

```bash
git add components/admin/HoverHelp.tsx tests/components/admin/hoverHelpLifecycle.test.tsx
git commit --no-verify -m "feat(admin): render popover caret from core placement output"
```

---

### Task 3: Blur-close

**Files:**
- Modify: `components/admin/HoverHelp.tsx` (root wrapper div 451-457 gains `ref` + `onBlur`)
- Test: Create `tests/components/admin/hoverHelpBlurClose.test.tsx`

**Interfaces:**
- Consumes: nothing new from Tasks 1-2 (independent behavior; same file).
- Produces: root wrapper `onBlur` = `onPairBlur`; carve-out predicate `blurCloseActive()`.

- [ ] **Step 1: Write the failing test file** `tests/components/admin/hoverHelpBlurClose.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Blur-close (spec 2026-07-22-hoverhelp-caret-blur-close §4).
 * jsdom asserts the handler logic with synthesized FocusEvents; REAL focus
 * traversal is covered by the §4.0 Chromium probe + e2e T-E4.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { HoverHelp, PopoverHostContext } from "@/components/admin/HoverHelp";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness({
  modalHost = false,
  learnMore = false,
  afterBodyText,
}: {
  modalHost?: boolean;
  learnMore?: boolean;
  afterBodyText?: string;
}) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const help = (
    <HoverHelp
      label="Help: blur"
      testId="bc"
      {...(learnMore ? { learnMore: { href: "/help/x" } } : {})}
      {...(afterBodyText !== undefined ? { afterBodyText } : {})}
    >
      <p>body</p>
    </HoverHelp>
  );
  return (
    <div>
      <button data-testid="outside-a">A</button>
      {modalHost ? (
        <div ref={paneRef} data-testid="pane">
          <PopoverHostContext.Provider value={paneRef}>{help}</PopoverHostContext.Provider>
        </div>
      ) : (
        help
      )}
      <button data-testid="outside-b">B</button>
    </div>
  );
}

const open = () => {
  const trigger = screen.getByTestId("bc-trigger");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  return trigger;
};
const expectClosed = () => {
  expect(screen.getByTestId("bc-trigger").getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByTestId("bc-body").className).toContain("hidden");
};
const expectOpen = () =>
  expect(screen.getByTestId("bc-trigger").getAttribute("aria-expanded")).toBe("true");

describe("pair-scoped blur-close", () => {
  test("T-B1: focusout to an outside control closes without moving focus", () => {
    render(<Harness />);
    const trigger = open();
    const outside = screen.getByTestId("outside-b");
    fireEvent.focusOut(trigger, { relatedTarget: outside });
    expectClosed();
  });

  test("T-B2: focusout to the portaled body link stays open", () => {
    render(<Harness learnMore />);
    const trigger = open();
    const link = screen.getByTestId("bc-body").querySelector("a");
    if (!link) throw new Error("link missing");
    fireEvent.focusOut(trigger, { relatedTarget: link });
    expectOpen();
  });

  test("T-B3: null relatedTarget is ignored (window blur / non-focusable click)", () => {
    render(<Harness />);
    const trigger = open();
    fireEvent.focusOut(trigger, { relatedTarget: null });
    expectOpen();
  });

  test("T-B4: bridge forward-Tab still closes and refocuses the trigger", () => {
    render(<Harness learnMore />);
    const trigger = open();
    const link = screen.getByTestId("bc-body").querySelector("a");
    if (!link) throw new Error("link missing");
    (link as HTMLElement).focus();
    fireEvent.keyDown(screen.getByTestId("bc-body"), { key: "Tab" });
    expectClosed();
    expect(document.activeElement).toBe(trigger);
  });

  test("T-B5: hover-open with focus elsewhere - outside focus moves never close", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("bc-trigger");
    fireEvent.pointerEnter(trigger.parentElement as HTMLElement, { pointerType: "mouse" });
    expectOpen();
    const a = screen.getByTestId("outside-a");
    const b = screen.getByTestId("outside-b");
    a.focus();
    fireEvent.focusOut(a, { relatedTarget: b }); // outside pair - handler not attached there
    expectOpen();
  });

  test("T-B6: modal host + learnMore - carve-out keeps it open", () => {
    render(<Harness modalHost learnMore />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectOpen();
  });

  test("T-B7: body host + learnMore closes (carve-out is modal-only)", () => {
    render(<Harness learnMore />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectClosed();
  });

  test("T-B8: modal host WITHOUT learnMore closes", () => {
    render(<Harness modalHost />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectClosed();
  });

  test("T-B9: modal host + afterBodyText only (narrowed, no link) closes", () => {
    render(<Harness modalHost afterBodyText="Second paragraph." />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectClosed();
  });

  test("T-B10: blur-close clears a pending pointer-leave timer (no stale close on reopen)", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const trigger = open();
    const root = trigger.parentElement as HTMLElement;
    fireEvent.pointerLeave(root, { pointerType: "mouse" }); // schedules 120ms close
    fireEvent.focusOut(trigger, { relatedTarget: screen.getByTestId("outside-b") });
    expectClosed();
    fireEvent.click(trigger); // immediate reopen
    expectOpen();
    vi.advanceTimersByTime(500); // stale timer would fire here if not cleared
    expectOpen();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpBlurClose.test.tsx`
Expected: FAIL — T-B1/T-B7/T-B8/T-B9/T-B10 fail (popover stays open; no blur handler exists).

- [ ] **Step 3: Implement** in `components/admin/HoverHelp.tsx`:

(a) Add to the import type list (line 55-57): `type FocusEvent as ReactFocusEvent,`

(b) Add `const rootRef = useRef<HTMLDivElement | null>(null);` next to `triggerRef` (line 157).

(c) After `onBodyFocus` (line 410), add:

```ts
  /**
   * Pair-scoped blur-close (spec 2026-07-22-hoverhelp-caret-blur-close §4).
   * ONE handler on the root wrapper: portal blurs bubble to it through the
   * React tree (§4.0 probe P2), so a body-side duplicate would double-fire.
   * DISABLED for modal-hosted learnMore popovers - their link is reached
   * through the host panel's Tab order (parent spec §4.5), and closing en
   * route would set it tabIndex=-1 (unreachable). relatedTarget null is
   * ignored: a click on the popover's own non-focusable text reports null
   * (probe P3) and must not dismiss. Never moves focus - the user left.
   */
  const blurCloseActive = () => !(hostRef !== null && learnMore !== undefined);
  const onPairBlur = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (!open || !blurCloseActive()) return;
    const rt = e.relatedTarget;
    if (!(rt instanceof Node)) return;
    if (rootRef.current?.contains(rt)) return; // trigger side
    if (bodyRef.current?.contains(rt)) return; // body side (portaled - not a DOM descendant)
    clearCloseTimer();
    setOpen(false);
  };
```

(d) On the root wrapper div (451-457): add `ref={rootRef}` and `onBlur={onPairBlur}`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpBlurClose.test.tsx tests/components/admin/hoverHelpLifecycle.test.tsx tests/components/admin/HoverHelp.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` — clean.

```bash
git add components/admin/HoverHelp.tsx tests/components/admin/hoverHelpBlurClose.test.tsx
git commit --no-verify -m "feat(admin): pair-scoped blur-close for HoverHelp popover"
```

---

### Task 4: Real-engine e2e — caret geometry + Tab-away

**Files:**
- Modify: `tests/e2e/hoverhelp-geometry.spec.ts` (new tests T-E1..T-E6), `tests/e2e/_hoverHelpGeometryLiveEntry.tsx` (add fixtures if the existing ones lack: a wide-trigger unclamped case, a side-top case, a no-learnMore Tab-away case — read the entry first; reuse existing fixtures where they already fit)

**Interfaces:**
- Consumes: `-caret` testids, `data-popover-side`, constants from Task 1.
- Produces: nothing downstream; this is the verification layer.

- [ ] **Step 1: Read `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`** and inventory fixtures: which have wide triggers (tracking case reachable), which clamp, which render side "top", which have no `learnMore`. Add minimal fixtures for any gap, following the file's existing fixture pattern verbatim.

- [ ] **Step 2: Write the new tests.** Shape (expectations derived from live rects + imported constants; `TOL = 0.5` already defined at line 34; every expected value computed by re-applying the §3.3 formulas to measured rects):

```ts
import {
  GAP,
  VIEWPORT_INSET,
  CARET_WIDTH,
  CARET_HEIGHT,
  CARET_EDGE_INSET,
  CARET_INNER_OFFSET,
} from "../../lib/popover/position";

const rectOf = (page: Page, testId: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) throw new Error(`missing ${id}`);
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width };
  }, testId);

/** Expected caret box left from live rects - the §3.3 formula, shared by all cases. */
const expectedCaretLeft = (trigger: {left: number; width: number}, bodyLeft: number, bodyWidth: number) => {
  const center0 = trigger.left + trigger.width / 2;
  const center = Math.min(
    Math.max(center0, bodyLeft + CARET_EDGE_INSET),
    bodyLeft + bodyWidth - CARET_EDGE_INSET,
  );
  return center - CARET_WIDTH / 2;
};
```

- T-E1 (unclamped, wide-trigger fixture, side bottom): open; measure trigger/body/caret; assert `Math.abs(caret.left - expectedCaretLeft(...)) <= TOL` where the fixture guarantees center0 within span (assert that precondition too, so the test self-reports if the fixture drifts); `Math.abs(caret.bottom - body.top) <= TOL`; `Math.abs(caret.top - trigger.bottom) <= TOL`.
- T-E2 (clamped fixture): same formula assertions; additionally assert the deep-pin branch is exercised: `center0 > bodyLeft + bodyWidth - CARET_EDGE_INSET` (fixture precondition) and caret center within `[bodyLeft + CARET_EDGE_INSET, bodyLeft + bodyWidth - CARET_EDGE_INSET]`.
- T-E3 (side-top fixture): `Math.abs(caret.top - body.bottom) <= TOL`; caret `data-popover-side === "top"`; computed style: outer `borderTopWidth === `${CARET_HEIGHT}px`` and `borderBottomWidth === "0px"` (inverse asserted in T-E1's fixture).
- T-E4 (no-learnMore fixture): `trigger.focus()`, `Enter` (opens), `Tab` → `aria-expanded` false and body class contains `hidden`.
- T-E5: scroll the container/page by a known delta; after a frame, re-measure: caret still abuts body edge and formula still holds.
- T-E6 (both orientations): computed styles per spec §8 — outer/inner `borderLeftWidth === borderRightWidth === `${CARET_WIDTH / 2}px``, side colors `rgba(0, 0, 0, 0)` (computed transparent), outer apex color === body computed `borderColor` (compare the two computed strings), inner apex color === body computed `backgroundColor`; rect deltas: `Math.abs(inner.left - outer.left) <= TOL`; apex-up `Math.abs(inner.top - outer.top - CARET_INNER_OFFSET) <= TOL`, seam `Math.abs(inner.bottom - body.top - CARET_INNER_OFFSET) <= TOL`; apex-down `Math.abs(outer.top - inner.top - CARET_INNER_OFFSET) <= TOL`, seam `Math.abs(body.bottom - inner.top - CARET_INNER_OFFSET) <= TOL`; caret computed `zIndex` === body computed `zIndex`. (Inner element selector: the caret's `firstElementChild`; give it `data-testid={`${testId}-caret-fill`}` in Task 2 ONLY if selecting proves awkward — prefer `:scope > div`.)

- [ ] **Step 3: Run standalone e2e locally**

Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts`
Expected: PASS. (If the suite needs env, source `.env.local` first per the repo's standalone-playwright note.)

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/hoverhelp-geometry.spec.ts tests/e2e/_hoverHelpGeometryLiveEntry.tsx
git commit --no-verify -m "test(admin): e2e caret geometry, visual contract, and Tab-away blur-close"
```

---

### Task 5: Transition audit (mandatory — component has a Transition Inventory)

**Files:** none new — audit + assert against `components/admin/HoverHelp.tsx`.

- [ ] **Step 1: Enumerate** every `AnimatePresence` (none exists in this file), ternary render, and conditional class block touching the caret or body. Check each against spec §6:

| From → To | Declared treatment |
| --- | --- |
| closed → placed-visible (either side) | fades with body, same classes |
| placed-visible → closed | fades with body |
| placed@bottom ↔ placed@top | instant (same measureAndApply call) |
| placed-visible ↔ suppressed | instant visibility toggle |
| closed ↔ suppressed | class flip only, invisible |
| position updates same side | instant per-frame |
| side flip mid-fade | instant swap inside uninterrupted opacity fade |
| suppression mid-fade | visibility wins instantly |
| suppression/flip with pending coalesced frame | single measureAndApply write, no torn frame |
| blur-close mid-open-fade | both nodes' classes flip in one commit |
| blur-close with pending 120ms timer | clearCloseTimer() before setOpen(false) (T-B10) |

- [ ] **Step 2: Verify** each row maps to code: the caret's class string carries the identical transition tokens as the body (T-J6d asserts it); orientation flips are pure attribute/inline writes (no transition on border properties — confirm `transition-[opacity,display]` scopes the transition so border swaps are instant); T-B10 covers the timer compound. Record the audit outcome as a comment block in the plan-execution notes (no code change expected; if a gap is found, fix within this task).

- [ ] **Step 3: Commit** (only if fixes were needed) `fix(admin): transition-audit repairs for caret`.

---

### Task 6: Impeccable dual-gate (invariant 8)

- [ ] **Step 1:** Run `/impeccable critique` on the diff (canonical v3 setup gates: `context.mjs` context load → register reference read).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix P0/P1 findings, or defer via `DEFERRED.md` entry with rationale. Re-run the affected gate after fixes.
- [ ] **Step 4: Commit** fixes as `fix(admin): impeccable <gate> findings for caret+blur-close`.

---

### Task 7: Close-out

**Files:**
- Modify: `DEFERRED.md` (remove the `HOVERHELP-CLAMP-CARET-1` entry, lines 11-15)

- [ ] **Step 1:** Remove the DEFERRED entry (both folded halves shipped). Commit: `docs: retire HOVERHELP-CLAMP-CARET-1 (caret + blur-close shipped)`.
- [ ] **Step 2:** Full pre-push gates: `pnpm test` (full local suite), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm format:check`, `pnpm build`.
- [ ] **Step 3:** Whole-diff cross-model adversarial review (fresh-eyes, REVIEWER ONLY) → iterate to APPROVE.
- [ ] **Step 4:** Push, open PR, real CI green (including `hoverhelp-geometry-e2e`), `gh pr merge --merge`, fast-forward local main, verify `0  0`.

---

## Self-review notes

- Spec coverage: §3.2/§3.3 → Task 1; §3.4/§3.5 + T-J series → Task 2; §4 + T-B series → Task 3; §8 T-E series → Task 4; §6 → Task 5; invariant-8 → Task 6; §9 DEFERRED removal → Task 7. T-C/T-B/T-J/T-E identifiers map 1:1 to spec §8.
- Anti-tautology: every unit expectation is derived (fixture rects + imported constants); e2e re-applies the §3.3 formula to LIVE rects with explicit fixture-precondition assertions so a drifted fixture fails loudly instead of silently testing the wrong branch; T-C6 is the single raw-number pin.
- Type consistency: `caret: { x: number; y: number } | null` (Task 1) is exactly what Task 2 reads (`placement.caret`); `toHostOffsets` is Task 2-internal; `blurCloseActive`/`onPairBlur` are Task 3-internal.
- Snippet typecheck: Task 1 + Task 3 snippets compiled against the repo's strict tsconfig during plan authoring (see review dispatch transcript); `@vitest-environment jsdom` pragma present on the new test file; lifecycle file already carries it.
