# HoverHelp Caret + Blur-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the always-on popover caret (pure-core math) and pair-scoped blur-close per spec `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md` (cross-model APPROVED R4), un-deferring `HOVERHELP-CLAMP-CARET-1`.

**Architecture:** Caret geometry is a step-5 extension of `computePopoverPlacement` in `lib/popover/position.ts` (all algebra in the pure core); the shell renders a sibling caret node in the existing portal and applies core output via the shared host-conversion path. Blur-close is one `onBlur` handler on the root wrapper (probe §4.0 P2: portal blurs bubble through the React tree), gated off for the modal-host+`learnMore` quadrant. Real-engine e2e tests are authored RED inside the task that turns them green (Tasks 2-3), so TDD ordering holds for every layer.

**Tech Stack:** React 19, Tailwind v4 (data-attribute variants), Vitest + jsdom, Playwright standalone config.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-22-hoverhelp-caret-blur-close.md`. §1.1 decisions are non-relitigable.
- TDD per task: failing test → minimal implementation → green → commit. E2e tests are authored and run RED in the same task as the implementation that turns them green (no post-hoc acceptance layer).
- Constants: `CARET_WIDTH = 12`, `CARET_HEIGHT = 6` (= `GAP`), `CARET_EDGE_INSET = 18`, `CARET_INNER_OFFSET = 1.5` — defined ONCE in `lib/popover/position.ts`. Tests derive every expectation from NAMED fixture rects + imported constants; raw caret numbers are pinned only in T-C6. The Tailwind class literals `top-[1.5px]`/`bottom-[1.5px]` are unavoidable statics (Tailwind cannot extract dynamic class strings) — T-J1 locks them to `CARET_INNER_OFFSET` at runtime so drift in either direction fails.
- No em-dashes in user-visible copy (no new copy; caret is aria-hidden).
- UI surface → invariant 8: impeccable critique + audit dual-gate before cross-model close-out review (Task 5), findings + dispositions recorded in the close-out doc regardless of outcome.
- Meta-test inventory: NONE of the candidate registries applies (Supabase boundaries, sentinel hiding, alert catalog, advisory locks, inline email) — pure client geometry + focus handling; no advisory-lock surface (`pg_advisory*` untouched); no mutation surface (invariant 10 N/A — no route/server-action changes).
- Layout-dimensions task: N/A — no fixed-dimension parent with flex/grid children (spec §7); geometric invariants are positional, asserted in a real browser (T-E series).
- Test wiring (verified): new/extended jsdom files under `tests/components/admin/` auto-run via `BASE_INCLUDE` (`vitest.projects.ts:34`) + parallel glob (`vitest.projects.ts:65`); `tests/lib/popover/position.test.ts` already included; `.github/workflows/hoverhelp-geometry-e2e.yml` path-triggers on `lib/popover/position.ts`, `components/admin/HoverHelp.tsx`, `tests/e2e/hoverhelp-geometry.spec.ts`, and `tests/e2e/_hoverHelpGeometryLiveEntry.tsx` (workflow lines 15-22) so the e2e gate fires on this PR unchanged.
- E2e helpers already in `tests/e2e/hoverhelp-geometry.spec.ts` and reused verbatim: `open(page, kase, triggerId)` (line 122: goto `${baseUrl}/live.html?case=${kase}` → wait `harness-ready` → `clickOpen`), `clickOpen` (converge-by-loop toggle, line 134), `box(page, testId)` (viewport rect), `TOL = 0.5` (line 34).

---

### Task 1: Caret math in the pure core

**Files:**
- Modify: `lib/popover/position.ts` (constants block near line 16; `PopoverPlacement` type at 41-49; `computePopoverPlacement` return path at 120-127)
- Test: `tests/lib/popover/position.test.ts` (extend)

**Interfaces:**
- Produces: exports `CARET_WIDTH: 12`, `CARET_HEIGHT: 6`, `CARET_EDGE_INSET: 18`, `CARET_INNER_OFFSET: 1.5`; placed variant gains `caret: { x: number; y: number } | null` (viewport coords of the caret box top-left). Tasks 2 and 3 consume all of these.

- [ ] **Step 1: Write the failing tests** — append to `tests/lib/popover/position.test.ts` (the `input()`/`rect()` helpers at lines 12-32 are in scope; the baseline fixture is `trigger rect(500,300,20,20)`, `naturalSize 288x200`, `bounds rect(8,8,984,784)`, `align "right"`). Import additions to the existing import block: `CARET_WIDTH, CARET_HEIGHT, CARET_EDGE_INSET, CARET_INNER_OFFSET`. Every expectation below is DERIVED from a named fixture rect + constants; preconditions that pick the branch are asserted so a drifted fixture fails loudly.

```ts
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

  it("T-C7: maxWidth active - caret span uses the clamped effectiveWidth", () => {
    const NARROW = rect(400, 8, 200, 784); // narrower than NATURAL_W -> maxWidth set
    const TRK = rect(500, 300, 20, 20);
    const p = computePopoverPlacement(
      input({ trigger: TRK, bounds: NARROW, wrappedHeightAt: () => 300 }),
    );
    if (p.kind !== "placed" || p.caret === null) throw new Error("expected placed caret");
    expect(p.maxWidth).toBe(NARROW.width);
    const center0 = TRK.left + TRK.width / 2;
    // precondition: tracking branch inside the CLAMPED span
    expect(center0).toBeGreaterThanOrEqual(p.viewport.x + CARET_EDGE_INSET);
    expect(center0).toBeLessThanOrEqual(p.viewport.x + NARROW.width - CARET_EDGE_INSET);
    expect(p.caret.x).toBe(center0 - CARET_WIDTH / 2);
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
Expected: FAIL — `CARET_WIDTH` has no export (compile error surfaces as suite failure).

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
// triangle; also the seam overhang over the body border. The shell's
// top-[1.5px]/bottom-[1.5px] class literals are locked to this value by
// tests (Tailwind cannot extract dynamic class strings).
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
Expected: PASS (existing decision-table tests stay green — the placed object only GAINED a key).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` — clean.

```bash
git add lib/popover/position.ts tests/lib/popover/position.test.ts
git commit --no-verify -m "feat(admin): caret placement math in popover position core"
```

---

### Task 2: Shell caret rendering (jsdom + e2e authored RED, then implementation)

**Files:**
- Modify: `components/admin/HoverHelp.tsx` (`measureAndApply` 215-284; layout effect cleanup 310-327; portal 503-555)
- Test: `tests/components/admin/hoverHelpLifecycle.test.tsx` (extend — T-J1..T-J6, T-A1..T-A3/T-A6)
- Test: `tests/e2e/hoverhelp-geometry.spec.ts` + `tests/e2e/_hoverHelpGeometryLiveEntry.tsx` (new `caret` case; T-E1/T-E2/T-E3/T-E5/T-E6)

**Interfaces:**
- Consumes: Task 1's `caret` field, `CARET_EDGE_INSET`, `CARET_WIDTH`, `CARET_HEIGHT`, `CARET_INNER_OFFSET`.
- Produces: portal renders body div THEN caret div (`data-testid` `` `${testId}-caret` ``, single inner fill div); caret carries `data-popover-side` when placed. Task 3's T-E4 reuses the `caret` live-entry case's `caret-blur` fixture.

- [ ] **Step 1: Write the failing jsdom tests** — append to the `measure-and-apply with stubbed rects` describe in `tests/components/admin/hoverHelpLifecycle.test.tsx` (helpers `stubRect`, `stubViewport`, `mount`, `PaneHarness`, `runPendingFrames` in scope). Import additions: `import { CARET_EDGE_INSET, CARET_INNER_OFFSET, CARET_WIDTH } from "@/lib/popover/position";`. Shared token list, defined once above the tests:

```ts
  /** Fade/stacking tokens the body and caret must SHARE (T-J6d parity). */
  const SHARED_FADE_TOKENS = [
    "transition-[opacity,display]",
    "duration-fast",
    "transition-discrete",
    "starting:opacity-0",
  ];

  test("T-J1/T-J6: caret node - structure, aria, class parity, inner-offset lock, closed state", () => {
    mount();
    const body = screen.getByTestId("lc-body");
    const caret = screen.getByTestId("lc-caret");
    // T-J6a portal order: body THEN caret (caret paints over the seam)
    expect(body.nextElementSibling).toBe(caret);
    // T-J6b exactly one inner (fill) triangle element
    expect(caret.children).toHaveLength(1);
    expect(caret.getAttribute("aria-hidden")).toBe("true");
    // T-J6d PARITY: every shared fade token present on BOTH nodes
    for (const token of SHARED_FADE_TOKENS) {
      expect(body.className).toContain(token);
      expect(caret.className).toContain(token);
    }
    expect(caret.className).toContain("z-50");
    expect(caret.className).toContain("pointer-events-none");
    // closed state mirrors the body's toggle
    expect(caret.className).toContain("hidden");
    expect(caret.className).not.toContain("block");
    // T-J1 inner-offset lock: class literals tied to the exported constant
    const inner = caret.firstElementChild;
    if (!(inner instanceof HTMLElement)) throw new Error("inner triangle missing");
    expect(inner.className).toContain(`top-[${CARET_INNER_OFFSET}px]`);
    expect(inner.className).toContain(`bottom-[${CARET_INNER_OFFSET}px]`);
  });

  test("T-A1: open/close class transition - both nodes flip together", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    for (const el of [body, caret]) {
      expect(el.className).toContain("block");
      expect(el.className).toContain("opacity-100");
      expect(el.className).not.toContain("hidden");
    }
    fireEvent.click(trigger); // close
    for (const el of [body, caret]) {
      expect(el.className).toContain("hidden");
      expect(el.className).not.toContain("block");
    }
  });

  test("T-J6c: placed caret mirrors data-popover-side and positions from core output", () => {
    stubViewport(1000, 800);
    const SCROLL_Y = 250;
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: SCROLL_Y });
    const TR = { left: 500, top: 300, width: 20, height: 20 };
    const trigger = mount();
    stubRect(trigger, TR);
    stubRect(document.body, { left: 0, top: -SCROLL_Y, width: 1000, height: 3000 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(caret.getAttribute("data-popover-side")).toBe("bottom");
    expect(body.getAttribute("data-popover-side")).toBe("bottom");
    // precondition: 20px trigger center is inside CARET_EDGE_INSET of the
    // flush-aligned body edge -> pinned branch (spec §3.3)
    expect(TR.width / 2).toBeLessThan(CARET_EDGE_INSET);
    // core: x = TR.left (align left default, unclamped); pinned caret center
    // = x + CARET_EDGE_INSET; body-host conversion adds scrollY to y only.
    expect(caret.style.left).toBe(`${TR.left + CARET_EDGE_INSET - CARET_WIDTH / 2}px`);
    expect(caret.style.top).toBe(`${TR.top + TR.height + SCROLL_Y}px`);
  });

  test("T-J2/T-A3: collision-hidden hides caret with body; recovery restores both", () => {
    stubViewport(1000, 800);
    const TR = { left: 500, top: 300, width: 20, height: 20 };
    const trigger = mount();
    stubRect(trigger, TR);
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(caret.style.visibility).toBe("");
    stubRect(trigger, { ...TR, top: -900 }); // out of bounds
    fireEvent.scroll(window);
    runPendingFrames();
    expect(body.style.visibility).toBe("hidden");
    expect(caret.style.visibility).toBe("hidden");
    expect(caret.hasAttribute("data-popover-side")).toBe(false);
    // T-A3 recovery: anchor returns -> both visible again, side restored
    stubRect(trigger, TR);
    fireEvent.scroll(window);
    runPendingFrames();
    expect(body.style.visibility).toBe("");
    expect(caret.style.visibility).toBe("");
    expect(caret.getAttribute("data-popover-side")).toBe("bottom");
  });

  test("T-J3: placed result with caret:null hides the caret alone", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    stubRect(trigger, { left: 100, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    // natural body narrower than 2*CARET_EDGE_INSET -> core returns caret:null
    stubRect(body, { left: 0, top: 0, width: 2 * CARET_EDGE_INSET - 6, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(body.style.visibility).toBe("");
    expect(caret.style.visibility).toBe("hidden");
  });

  test("T-J4: pane-host caret conversion applies host offsets like the body", () => {
    stubViewport(1000, 800);
    render(<PaneHarness />);
    const trigger = screen.getByTestId("ph-trigger");
    const pane = screen.getByTestId("pane-host");
    const PANE = { left: 100, top: 100, width: 400, height: 300 };
    const TR = { left: 150, top: 150, width: 20, height: 20 };
    const SCROLL = { top: 120, left: 40 };
    Object.defineProperty(pane, "scrollTop", { configurable: true, value: SCROLL.top });
    Object.defineProperty(pane, "scrollLeft", { configurable: true, value: SCROLL.left });
    Object.defineProperty(pane, "clientTop", { configurable: true, value: 0 });
    Object.defineProperty(pane, "clientLeft", { configurable: true, value: 0 });
    stubRect(pane, PANE);
    stubRect(trigger, TR);
    const body = screen.getByTestId("ph-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 100 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("ph-caret");
    // pinned branch again (20px trigger); derive from named rects:
    const caretViewportX = TR.left + CARET_EDGE_INSET - CARET_WIDTH / 2;
    const caretViewportY = TR.top + TR.height; // trigger.bottom, side bottom
    expect(caret.style.left).toBe(`${caretViewportX - PANE.left + SCROLL.left}px`);
    expect(caret.style.top).toBe(`${caretViewportY - PANE.top + SCROLL.top}px`);
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

  test("T-A2/T-A6: live side flip updates BOTH nodes atomically in one frame, open classes intact", () => {
    stubViewport(1000, 800);
    const TR = { left: 500, top: 300, width: 20, height: 20 };
    const trigger = mount();
    stubRect(trigger, TR);
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const caret = screen.getByTestId("lc-caret");
    expect(caret.getAttribute("data-popover-side")).toBe("bottom");
    // move trigger near the bottom edge -> only space above fits
    const LOW = { ...TR, top: 700 };
    stubRect(trigger, LOW);
    fireEvent.scroll(window);
    runPendingFrames(); // ONE coalesced frame
    expect(body.getAttribute("data-popover-side")).toBe("top");
    expect(caret.getAttribute("data-popover-side")).toBe("top");
    // atomic: caret.y follows the SAME measurement (trigger.top - GAP)
    expect(caret.style.top).toBe(`${LOW.top - GAP}px`);
    // mid-"fade" semantics: open classes untouched by the flip
    expect(caret.className).toContain("block");
    expect(caret.className).toContain("opacity-100");
  });
```

(`GAP` is already imported in this file? Verify — if not, extend the import from `@/lib/popover/position`.)

- [ ] **Step 2: Write the failing e2e tests.** (a) In `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`, add a `caret` case to the `CaseView` switch (before `default`), following the existing `At`/`ShortHelp` patterns:

```tsx
    case "caret":
      return (
        <>
          {/* Wide custom trigger: half-width > CARET_EDGE_INSET so the caret
              TRACKS the raw center (unpinned branch). */}
          <At x={safeX(300)} y={200}>
            <HoverHelp
              label="Help: caret track"
              testId="caret-track"
              align="left"
              trigger={
                <span style={{ width: 60, display: "inline-block", textAlign: "center" }}>
                  badge
                </span>
              }
            >
              <p>Short body copy for caret-track.</p>
            </HoverHelp>
          </At>
          {/* Right-edge: align-left body clamps left; the 20px default trigger
              center lands past the far inset (deep-pin branch). */}
          <At x={window.innerWidth - 30} y={200}>
            <ShortHelp testId="caret-clamp" align="left" />
          </At>
          {/* Bottom-pinned: side "top" placement (apex-down caret). */}
          <At x={safeX(500)} y={window.innerHeight - 60}>
            <ShortHelp testId="caret-top" />
          </At>
          {/* Plain popover + focusable neighbor for the Tab-away case (T-E4). */}
          <At x={safeX(200)} y={400}>
            <span>
              <HoverHelp label="Help: caret blur" testId="caret-blur" align="left">
                <p>Short body copy for caret-blur.</p>
              </HoverHelp>
              <button type="button" data-testid="after-btn">
                next
              </button>
            </span>
          </At>
        </>
      );
```

(b) In `tests/e2e/hoverhelp-geometry.spec.ts`, extend the position import with `CARET_WIDTH, CARET_HEIGHT, CARET_EDGE_INSET, CARET_INNER_OFFSET` and add:

```ts
/** §3.3 clamp formula re-applied to LIVE rects - shared by all caret cases. */
function caretExpectedLeft(t: Box, b: Box): number {
  const center0 = (t.left + t.right) / 2;
  const center = Math.min(
    Math.max(center0, b.left + CARET_EDGE_INSET),
    b.right - CARET_EDGE_INSET,
  );
  return center - CARET_WIDTH / 2;
}

async function styleOf(
  page: Page,
  testId: string,
  inner: boolean,
  props: string[],
): Promise<Record<string, string>> {
  return page.evaluate(
    ({ testId, inner, props }) => {
      let el = document.querySelector(`[data-testid="${testId}"]`);
      if (inner) el = el?.firstElementChild ?? null;
      if (!el) throw new Error(`missing ${testId}${inner ? " inner" : ""}`);
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, cs.getPropertyValue(p)]));
    },
    { testId, inner, props },
  );
}

test.describe("caret geometry (spec 2026-07-22-hoverhelp-caret-blur-close §8)", () => {
  test("T-E1: tracking caret centers on a wide trigger and fills the gap", async ({ page }) => {
    await open(page, "caret", "caret-track");
    const t = await box(page, "caret-track-trigger");
    const b = await box(page, "caret-track-body");
    const c = await box(page, "caret-track-caret");
    const center0 = (t.left + t.right) / 2;
    // fixture precondition: tracking branch
    expect(center0).toBeGreaterThanOrEqual(b.left + CARET_EDGE_INSET);
    expect(center0).toBeLessThanOrEqual(b.right - CARET_EDGE_INSET);
    expect(Math.abs(c.left - caretExpectedLeft(t, b))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(c.bottom - b.top)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(c.top - t.bottom)).toBeLessThanOrEqual(TOL);
  });

  test("T-E2: deep clamp pins the caret inside the body span", async ({ page }) => {
    await open(page, "caret", "caret-clamp");
    const t = await box(page, "caret-clamp-trigger");
    const b = await box(page, "caret-clamp-body");
    const c = await box(page, "caret-clamp-caret");
    const center0 = (t.left + t.right) / 2;
    // fixture precondition: deep-pin branch
    expect(center0).toBeGreaterThan(b.right - CARET_EDGE_INSET);
    expect(Math.abs(c.left - caretExpectedLeft(t, b))).toBeLessThanOrEqual(TOL);
    const caretCenter = (c.left + c.right) / 2;
    expect(caretCenter).toBeGreaterThanOrEqual(b.left + CARET_EDGE_INSET - TOL);
    expect(caretCenter).toBeLessThanOrEqual(b.right - CARET_EDGE_INSET + TOL);
  });

  test("T-E3: side-top caret sits under the body, apex down", async ({ page }) => {
    await open(page, "caret", "caret-top");
    const b = await box(page, "caret-top-body");
    const c = await box(page, "caret-top-caret");
    expect(Math.abs(c.top - b.bottom)).toBeLessThanOrEqual(TOL);
    await expect(page.getByTestId("caret-top-caret")).toHaveAttribute("data-popover-side", "top");
    const s = await styleOf(page, "caret-top-caret", false, [
      "border-top-width",
      "border-bottom-width",
    ]);
    expect(s["border-top-width"]).toBe(`${CARET_HEIGHT}px`);
    expect(s["border-bottom-width"]).toBe("0px");
  });

  test("T-E5: caret tracks the trigger across a scroll reflow", async ({ page }) => {
    await open(page, "caret", "caret-track");
    await page.evaluate(() => window.scrollBy(0, 40));
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const t = await box(page, "caret-track-trigger");
    const b = await box(page, "caret-track-body");
    const c = await box(page, "caret-track-caret");
    expect(Math.abs(c.left - caretExpectedLeft(t, b))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(c.bottom - b.top)).toBeLessThanOrEqual(TOL);
  });

  test("T-E6: visual contract - triangles, tokens, seam, stacking (both orientations)", async ({
    page,
  }) => {
    for (const [kase, id, apexUp] of [
      ["caret", "caret-track", true],
      ["caret", "caret-top", false],
    ] as const) {
      await open(page, kase, id);
      const bodyS = await styleOf(page, `${id}-body`, false, [
        "border-top-color",
        "background-color",
        "z-index",
      ]);
      const outerS = await styleOf(page, `${id}-caret`, false, [
        "border-left-width",
        "border-right-width",
        "border-left-color",
        "border-right-color",
        "border-top-width",
        "border-bottom-width",
        "border-top-color",
        "border-bottom-color",
        "z-index",
      ]);
      const innerS = await styleOf(page, `${id}-caret`, true, [
        "border-left-width",
        "border-right-width",
        "border-left-color",
        "border-right-color",
        "border-top-width",
        "border-bottom-width",
        "border-top-color",
        "border-bottom-color",
      ]);
      const TRANSPARENT = "rgba(0, 0, 0, 0)";
      for (const s of [outerS, innerS]) {
        expect(s["border-left-width"]).toBe(`${CARET_WIDTH / 2}px`);
        expect(s["border-right-width"]).toBe(`${CARET_WIDTH / 2}px`);
        expect(s["border-left-color"]).toBe(TRANSPARENT);
        expect(s["border-right-color"]).toBe(TRANSPARENT);
      }
      const apex = apexUp ? "bottom" : "top";
      const off = apexUp ? "top" : "bottom";
      expect(outerS[`border-${apex}-width`]).toBe(`${CARET_HEIGHT}px`);
      expect(outerS[`border-${off}-width`]).toBe("0px");
      // outer apex color = the body's border color; inner apex = body fill
      expect(outerS[`border-${apex}-color`]).toBe(bodyS["border-top-color"]);
      expect(innerS[`border-${apex}-color`]).toBe(bodyS["background-color"]);
      expect(outerS["z-index"]).toBe(bodyS["z-index"]);
      // rect deltas: inner alignment + seam overhang (position math, not clipping proof)
      const b = await box(page, `${id}-body`);
      const outer = await box(page, `${id}-caret`);
      const inner = await page.evaluate((tid) => {
        const el = document.querySelector(`[data-testid="${tid}"]`)?.firstElementChild;
        if (!el) throw new Error("inner missing");
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }, `${id}-caret`);
      expect(Math.abs(inner.left - outer.left)).toBeLessThanOrEqual(TOL);
      if (apexUp) {
        expect(Math.abs(inner.top - outer.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(inner.bottom - b.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
      } else {
        expect(Math.abs(outer.top - inner.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
        expect(Math.abs(b.bottom - inner.top - CARET_INNER_OFFSET)).toBeLessThanOrEqual(TOL);
      }
    }
  });
});
```

- [ ] **Step 3: Run both suites to verify RED**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpLifecycle.test.tsx`
Expected: FAIL — `getByTestId("lc-caret")` finds nothing.
Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts --grep "T-E"`
Expected: FAIL — `caret-track-caret` absent (existing suites in the file stay green; source `.env.local` first if the standalone config requires it).

- [ ] **Step 4: Implement** in `components/admin/HoverHelp.tsx`:

(a) Add `const caretRef = useRef<HTMLDivElement | null>(null);` next to `bodyRef` (line 158).

(b) In `measureAndApply`, replace the placed-branch application block (lines 268-283) with (shared converter so body and caret cannot drift):

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

(c) In the hidden branch (lines 251-266), after the body writes add:

```ts
      const caretEl = caretRef.current;
      if (caretEl) {
        caretEl.style.visibility = "hidden";
        delete caretEl.dataset["popoverSide"];
      }
```

(d) In the layout-effect cleanup (lines 321-326), extend the attribute-lifecycle reset:

```ts
      const caretEl = caretRef.current;
      if (caretEl) {
        delete caretEl.dataset["popoverSide"];
        caretEl.style.visibility = "";
      }
```

(e) Portal: wrap the existing body div in a fragment and append the caret AFTER it:

```tsx
          <>
            {/* existing body div, UNCHANGED, then: */}
            <div
              ref={caretRef}
              aria-hidden="true"
              data-testid={`${testId}-caret`}
              /* top-[1.5px]/bottom-[1.5px] literals = CARET_INNER_OFFSET
                 (lib/popover/position.ts); locked by T-J1 - Tailwind cannot
                 extract dynamic class strings. */
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

- [ ] **Step 5: Run both suites to verify GREEN**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpLifecycle.test.tsx tests/components/admin/HoverHelp.test.tsx tests/components/admin/hoverHelpCompactTrigger.test.tsx tests/components/admin/hoverHelpAfterBody.test.tsx tests/components/admin/hoverHelpEscapeContainment.test.tsx`
Expected: PASS.
Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts`
Expected: PASS (whole file, incl. pre-existing suites).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` — clean.

```bash
git add components/admin/HoverHelp.tsx tests/components/admin/hoverHelpLifecycle.test.tsx tests/e2e/hoverhelp-geometry.spec.ts tests/e2e/_hoverHelpGeometryLiveEntry.tsx
git commit --no-verify -m "feat(admin): render popover caret from core placement output"
```

---

### Task 3: Blur-close (jsdom + e2e authored RED, then implementation)

**Files:**
- Modify: `components/admin/HoverHelp.tsx` (root wrapper div gains `ref` + `onBlur`)
- Test: Create `tests/components/admin/hoverHelpBlurClose.test.tsx`
- Test: `tests/e2e/hoverhelp-geometry.spec.ts` (T-E4; reuses Task 2's `caret-blur` fixture)

**Interfaces:**
- Consumes: Task 2's `caret` live-entry case (`caret-blur` + `after-btn`).
- Produces: root wrapper `onBlur` = `onPairBlur`; carve-out predicate `blurCloseActive()`.

- [ ] **Step 1: Write the failing jsdom test file** `tests/components/admin/hoverHelpBlurClose.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * Blur-close (spec 2026-07-22-hoverhelp-caret-blur-close §4).
 * jsdom asserts the handler logic with synthesized FocusEvents; REAL focus
 * traversal is covered by the §4.0 Chromium probe + e2e T-E4.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  test("T-B1: focusout to an outside control closes and leaves focus where the user sent it", () => {
    render(<Harness />);
    const trigger = open();
    const outside = screen.getByTestId("outside-b");
    // browser order: focus moves FIRST, then focusout fires with relatedTarget
    outside.focus();
    fireEvent.focusOut(trigger, { relatedTarget: outside });
    expectClosed();
    expect(document.activeElement).toBe(outside); // no focus steal
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
    act(() => {
      vi.advanceTimersByTime(500); // stale timer would fire in here if not cleared
    });
    expectOpen();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Write the failing e2e test** — append inside the caret describe in `tests/e2e/hoverhelp-geometry.spec.ts`:

```ts
  test("T-E4: real Tab-away closes a plain popover; focus lands on the destination", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/live.html?case=caret`);
    await page.getByTestId("harness-ready").waitFor({ state: "attached" });
    const trigger = page.getByTestId("caret-blur-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter"); // native button: Enter fires click -> toggles open
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const active = await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    );
    expect(active).toBe("after-btn"); // blur-close never moves focus
  });
```

- [ ] **Step 3: Run both to verify RED**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpBlurClose.test.tsx`
Expected: FAIL — T-B1/T-B7/T-B8/T-B9/T-B10 fail (no blur handler exists; popover stays open).
Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts --grep "T-E4"`
Expected: FAIL — `aria-expanded` stays `"true"` after Tab.

- [ ] **Step 4: Implement** in `components/admin/HoverHelp.tsx`:

(a) Add to the import type list (lines 55-57): `type FocusEvent as ReactFocusEvent,`

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

(d) On the root wrapper div: add `ref={rootRef}` and `onBlur={onPairBlur}`.

- [ ] **Step 5: Run both to verify GREEN**

Run: `pnpm exec vitest run tests/components/admin/hoverHelpBlurClose.test.tsx tests/components/admin/hoverHelpLifecycle.test.tsx tests/components/admin/HoverHelp.test.tsx`
Expected: PASS.
Run: `pnpm exec playwright test --config tests/e2e/standalone.config.ts tests/e2e/hoverhelp-geometry.spec.ts`
Expected: PASS (whole file).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` — clean.

```bash
git add components/admin/HoverHelp.tsx tests/components/admin/hoverHelpBlurClose.test.tsx tests/e2e/hoverhelp-geometry.spec.ts
git commit --no-verify -m "feat(admin): pair-scoped blur-close for HoverHelp popover"
```

---

### Task 4: Transition-audit verification (mandatory — component has a Transition Inventory)

No new tests expected: the executable coverage was authored RED in Tasks 2-3. This task verifies each spec §6 inventory row maps to an assertion (or a declared-untestable CSS-only fade) and records the mapping.

- [ ] **Step 1: Verify the mapping table** against the shipped tests; every row must resolve:

| §6 row | Executable coverage |
| --- | --- |
| closed → placed-visible (fade) | T-A1 (class flip both nodes); CSS fade itself is declarative (`transition-discrete`), parity locked by T-J1/T-J6d |
| placed-visible → closed | T-A1 close half |
| placed@bottom ↔ placed@top | T-A2 (live flip, one frame, both nodes) |
| placed-visible ↔ suppressed | T-J2 (hide) + T-A3 (recovery) + T-J3 (caret-only) |
| closed ↔ suppressed | T-J5 (cleanup resets visibility + side attr on close) |
| position updates same side | T-E5 (real scroll reflow) + existing u5 coalescing |
| side flip mid-fade | T-A2 asserts open classes intact through the flip |
| suppression mid-fade | T-J2 (visibility wins while open classes present) |
| pending-frame atomicity | T-A2/T-A6 (single `runPendingFrames()` updates both nodes consistently) |
| blur-close mid-open-fade | T-B1 (single commit closes; body class asserted) |
| blur-close with pending 120ms timer | T-B10 (act-wrapped timer advance) |

- [ ] **Step 2:** Also verify no `AnimatePresence` exists in `components/admin/HoverHelp.tsx` (grep) and that `transition-[opacity,display]` scopes transitions so the border/orientation swap is instant (no `transition-all`). If any row lacks coverage, add the missing test IN THIS TASK (red → green) before proceeding.

- [ ] **Step 3:** Record the completed table in the close-out doc (Task 5 creates it; stage the note now in `docs/superpowers/plans/2026-07-22-hoverhelp-caret-blur-close-closeout.md` under "Transition audit"). Commit: `docs: transition-audit mapping for caret+blur-close`.

---

### Task 5: Impeccable dual-gate (invariant 8)

- [ ] **Step 1:** Run `/impeccable critique` on the diff (canonical v3 setup gates: `context.mjs` context load → register reference read).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix P0/P1 findings, or defer via `DEFERRED.md` entry with rationale. Re-run the affected gate after fixes.
- [ ] **Step 4:** Record ALL findings + dispositions (including "none") in `docs/superpowers/plans/2026-07-22-hoverhelp-caret-blur-close-closeout.md` §"Impeccable dual-gate" — the auditable artifact invariant 8 requires (this feature has no milestone handoff doc; the close-out doc is its equivalent, committed regardless of outcome).
- [ ] **Step 5: Commit** `docs: impeccable dual-gate record for caret+blur-close` (plus `fix(admin): ...` commits for any findings fixed).

---

### Task 6: Close-out

**Files:**
- Modify: `DEFERRED.md` (remove the `HOVERHELP-CLAMP-CARET-1` entry, lines 11-15)

- [ ] **Step 1:** Remove the DEFERRED entry (both folded halves shipped). Commit: `docs: retire HOVERHELP-CLAMP-CARET-1 (caret + blur-close shipped)`.
- [ ] **Step 2:** Full pre-push gates: `pnpm test` (full local suite), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm format:check`, `pnpm build`.
- [ ] **Step 3:** Whole-diff cross-model adversarial review (fresh-eyes, REVIEWER ONLY) → iterate to APPROVE.
- [ ] **Step 4:** Push, open PR, real CI green (including `hoverhelp-geometry-e2e`), `gh pr merge --merge`, fast-forward local main, verify `0  0`.

---

## Self-review notes

- Spec coverage: §3.2/§3.3 → Task 1; §3.4/§3.5 + T-J/T-A series → Task 2; §4 + T-B series + T-E4 → Task 3; §8 T-E1/2/3/5/6 → Task 2; §6 → Task 4 mapping table; invariant-8 → Task 5; §9 DEFERRED removal → Task 6. Every spec §8 test ID appears as executable code in exactly one task.
- TDD: e2e tests are authored and red-run INSIDE Tasks 2-3, before their implementations. No post-hoc acceptance layer remains.
- Anti-tautology: every expectation derives from NAMED fixture rects (`TRK`/`BOUNDS`/`TR`/`PANE`/`SCROLL`) + imported constants, with branch preconditions asserted; the e2e re-applies the §3.3 formula to LIVE rects; T-C6 is the single raw-number pin. T-J1 locks the two unavoidable Tailwind class literals to `CARET_INNER_OFFSET`.
- Type consistency: `caret: { x: number; y: number } | null` (Task 1) is exactly what Task 2 reads; `toHostOffsets` Task 2-internal; `blurCloseActive`/`onPairBlur` Task 3-internal; e2e helpers (`open`, `clickOpen`, `box`, `TOL`, `Box`) verified against the live spec file (lines 34, 113-150).
- Snippet typecheck: Task 1 core step-5 + Task 3 harness snippets compiled against the repo's strict tsconfig in a scratch project during plan authoring (zero errors in snippet files; one pre-existing repo-ambient pdfjs d.ts error unrelated to these files).
