# Popover placement against the visual viewport under pinch-zoom

**Date:** 2026-07-24
**Status:** round 2 (round 1 returned BLOCKING; all six findings dispositioned below)
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT` (BACKLOG.md:43-49)
**Supersedes:** `2026-07-22-hoverhelp-smart-position` §1.1 R8 (that spec's line 30) — see §1.1 R2
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24, brainstorming gate); spec + plan user-review gates waived.

---

## §1 Problem

Both popover consumers build their bounds rectangle from the LAYOUT viewport:

```ts
const viewportRect: Rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: …, bottom: … };
const hostRect = host === document.body ? viewportRect : toRect(host.getBoundingClientRect());
const bounds = insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET);
```

`components/admin/HoverHelp.tsx:226-239` and, byte-for-byte the same shape, `components/admin/showpage/ShareHub.tsx:247-258`.

Pinch-zoom does not change the layout viewport — `window.innerWidth/innerHeight` are constant across every zoom level (§3.1, measured). It changes the VISUAL viewport: a smaller, offset window onto the same layout. So an open popover is placed inside a rectangle that is partly off-screen, and the user sees a clipped popover whose missing text cannot be scrolled to. Zoom-pan also does not fire `window`'s `scroll` event (§3.1, measured: `window.scrollX/scrollY` stay `0,0` through a full pan), so an already-open popover does not reposition as the user pans.

Goal: on the engines where the coordinate convention is verifiable, an open popover is fully inside the part of the page the user can actually see, at any usable zoom level, and repositions as they pan.

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | **Behavior: the visible slice becomes the bounds for BOTH sizing and position.** Under zoom the popover narrows, wraps taller, and scrolls past its `maxHeight` cap. Two alternatives were considered and rejected: clamping position only (keeps the full width, leaves the right side permanently cut off with no way to scroll to it) and a fits-or-fallback threshold (never engages at the zoom levels that cause the problem) | User choice, brainstorming 2026-07-24, against a rendered side-by-side mockup of all three at 1.5x and 3.5x |
| R2 | This spec SUPERSEDES `2026-07-22-hoverhelp-smart-position` §1.1 R8 ("positioning is computed against the LAYOUT viewport … the user pans"). R8 explicitly filed its own successor as `BL-HOVERHELP-VISUAL-VIEWPORT`; this is that successor | smart-position spec line 30; BACKLOG.md:43-49 |
| R3 | **Narrowing is not a regression to be fixed.** At 3.5x zoom the visible slice is ~111 CSS px wide, so the popover renders as a narrow scrolling column — MAGNIFIED 3.5x on screen, so its text is larger than the unzoomed popover's, and every word stays reachable by scrolling. A width floor was considered and rejected: it would guarantee horizontal overflow with no horizontal scroll, i.e. permanently unreachable text | Brainstorming 2026-07-24; mockup rows at 1.5x/3.5x |
| R4 | **Panning the trigger out of the visible slice hides the popover.** Falls out of the existing `overlapsPositively(trigger, bounds)` gate (lib/popover/position.ts:112) once bounds are the visible slice. Correct — the popover is an anchored annotation on something no longer on screen — and self-healing: panning back re-places it on the next `visualViewport` scroll event. Focus-inside-body takes the already-shipped close-and-restore path (HoverHelp.tsx:259-264) | This spec |
| R5 | **WebKit is EXCLUDED: it keeps today's layout-viewport behavior.** Round 1 F1 (BLOCKING) established that a WebKit origin branch is not sufficient. On WebKit with an absolute-positioned floating element, client coordinates are visual-viewport-relative (§3.4), which would also require changing the body-host conversion `pt.x + window.scrollX` (HoverHelp.tsx:283-290) to add the visual offset — and Playwright's WebKit exposes no CDP, so NO part of that transform is verifiable in any harness this repo has. Rather than ship an unverifiable coordinate transform to the platform where pinch-zoom matters most, `visibleViewportRect` returns the layout rect on WebKit. WebKit users get exactly today's behavior: no fix, and no regression. Re-opening this requires a real iOS Safari measurement, not an argument | Round 1 F1; §3.4; §4.1 |
| R6 | **`lib/popover/position.ts` is not modified.** `bounds` is already an input (lib/popover/position.ts:46), and every consequence of a smaller bounds rect — narrower `maxWidth`, taller wrap, side flip, `maxHeight` cap, hidden gate — already falls out of the shipped algebra | lib/popover/position.ts:100-156 |
| R7 | **Scale 1 is a no-op ONLY when the visual viewport equals the layout viewport.** Round 1 F2 (HIGH) correctly refuted the blanket claim. Two documented states break the equality at scale 1: classic (non-overlay) scrollbars, where `innerWidth` includes the scrollbar gutter and `visualViewport.width` excludes it; and an on-screen keyboard, which shrinks the visual viewport with no zoom at all. In both, this change bounds the popover by the genuinely visible area — **an intended improvement, not a regression** — and this spec ratifies that as desired behavior rather than claiming it cannot happen. What IS guaranteed: given equal dimensions and zero offsets, the returned rect is deep-equal to today's (T-U7) | Round 1 F2; §3.5 |
| R8 | This is a geometry change with **no new visual states, no new rendered elements, no new copy, and no new tokens** | §4.6-§4.8 |
| R9 | **Below the popover's own irreducible box, bounds are exceeded rather than obeyed.** Round 1 F3 (HIGH) is correct: `max-width` cannot shrink a border-box below its padding + border, so a bounds rect narrower than that floor yields a popover that overflows it. Floors: HoverHelp `2*(14+1) = 30px` (`p-3.5` + `border`, HoverHelp.tsx:576), ShareHub `2*(10+1) = 22px` (`p-2.5` + `border`, ShareHub.tsx:699). This is reachable only past ~10x zoom, where a 30px-wide popover is unusable whichever way it is placed. Ratified posture: the popover stays PLACED and anchored and is permitted to exceed the bounds in that regime — hiding it would remove the annotation the user just asked for, and a hardcoded floor constant would rot against the class strings. §5's containment assertions are scoped to bounds that can host the box, and §5 pins the placed-not-hidden behavior at the boundary | Round 1 F3; CSS Sizing 3 §box-sizing |
| R10 | **`ShareHub` is IN SCOPE.** Round 1 F6 (MEDIUM) was correct and my §2 sweep was wrong — it had been run in the stale main checkout, which predates ShareHub's popover reaching `origin/main`. `components/admin/showpage/ShareHub.tsx` builds the identical viewport rect (:247-258), uses the identical host model, and calls the same `computePopoverPlacement` (:275). Per the class-sweep rule, the fix lands on the CLASS, not the named instance | Round 1 F6; §2 sweep re-run in the worktree |

## §2 Current state (citations verified against worktree `fix/hoverhelp-visual-viewport` @ b58fb0966)

**Corrected sweep** (re-run in the worktree, `grep -rn "innerWidth\|innerHeight\|visualViewport" lib components app`):

| hit | disposition |
|---|---|
| `components/admin/HoverHelp.tsx:229-232` | IN SCOPE — consumer 1 |
| `components/admin/showpage/ShareHub.tsx:250-253` | IN SCOPE — consumer 2 (R10) |
| `components/admin/dev/DevCaptureControl.tsx:98-99` | out — records viewport size into a capture payload; positions nothing |
| `components/agenda/AgendaPdfViewer.tsx:15` | out — a comment describing removed code |

`grep -rn "computePopoverPlacement" lib components app` confirms exactly two call sites: `HoverHelp.tsx:241` and `ShareHub.tsx:275`. There is no third consumer.

- HoverHelp measure path: `measureAndApply` at :218; layout-viewport rect :226-233; host rect :238; bounds :239; host-offset conversion :283-290.
- HoverHelp reposition listeners: `window` `scroll` (capture, passive) :332, `window` `resize` :333, `ResizeObserver` over trigger/body/host :334-337; teardown :339-344. Coalescer `schedule()` :314-320.
- ShareHub measure path: viewport rect :247-253; host rect :257; bounds :258; placement call :275.
- ShareHub reposition listeners: `window` `resize` :372 with teardown :404, plus two `ResizeObserver`s (:378, :393) each guarded by `typeof ResizeObserver === "function"`. **ShareHub has no `window` `scroll` listener today** — a pre-existing difference from HoverHelp, out of scope here (§8).
- Popover body boxes: HoverHelp `p-3.5` + `border` at :576; ShareHub `w-[308px]`, `p-2.5` + `border` at :699. These are the R9 floors.
- Pure core: `computePopoverPlacement` at `lib/popover/position.ts:100`; `bounds` documented at :46; `VIEWPORT_INSET = 8` at :17; `GAP = 6` at :16; hidden gates :104-115 (`overlapsPositively` at :112); width-first sizing :118-121; x-clamp :138-139. `Rect` at :30-37.
- Existing suites: `tests/lib/popover/position.test.ts` (pure core); `tests/components/admin/hoverHelpLifecycle.test.tsx` (jsdom, stubs rAF/ResizeObserver/rects — the idiom §5 reuses, `stubRect` at :157); `tests/components/admin/showpage/shareHub.test.tsx`.
- Real-engine harness: `tests/e2e/hoverhelp-geometry.spec.ts` + `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`; standalone via `tests/e2e/standalone.config.ts` (`standalone-chromium`, `devices["Desktop Chrome"]` — no `isMobile`, no `hasTouch`), script `pnpm test:e2e:hoverhelp-geometry` (package.json:60). The `testMatch` allow-list already contains `hoverhelp-geometry`. The entry already provides BODY-host cases and PANEL-host cases (`PaneCase` :112, `NarrowPaneCase` :83, both wrapping `PopoverHostContext.Provider`), so §5's two-host requirement needs no new fixture.
- CI: `.github/workflows/hoverhelp-geometry-e2e.yml` — `pull_request` path filter lists `components/admin/HoverHelp.tsx` and `lib/popover/position.ts`, plus `workflow_dispatch`. It does NOT list `ShareHub.tsx` or the new module (§6).

## §3 Empirical probe (ran 2026-07-24, pre-spec)

Per the mandatory spike rule (docs/agents/spec-self-review.md:21). Playwright 1.59.1 + Chromium, driving CDP directly.

### §3.1 Mobile context (`viewport 390x780`, `isMobile`, `hasTouch`, `deviceScaleFactor 2`)

| state | `innerWidth/Height` | `vv.width/height` | `vv.offsetLeft/Top` | `scrollX/Y` | element rect |
|---|---|---|---|---|---|
| baseline | 390 / 780 | 390 / 780 | 0 / 0 | 0 / 0 | 170, 360 |
| `setPageScaleFactor 3` | 390 / 780 | 130 / 260 | 0 / 0 | 0 / 0 | 170, 360 |
| after pan | 390 / 780 | 130 / 260 | 0 / 150 | 0 / 0 | 170, 360 |
| `synthesizePinchGesture 2.5` | 390 / 780 | 156 / 312 | 117 / 234 | 0 / 0 | 170, 360 |

Findings: (a) the layout viewport is invariant under zoom; (b) `visualViewport` reports the visible slice and its offset; (c) **`getBoundingClientRect()` is layout-viewport-relative in Chromium** — the probe element's rect never moved, for a `position: absolute` element AND for a `position: fixed` one; (d) `window.scrollX/scrollY` never change, so `window`'s `scroll` event cannot carry a zoom-pan; (e) one pan emitted **80** `visualViewport` events — the existing rAF coalescer is load-bearing.

### §3.2 Event coverage

`visualViewport` `scroll` + `resize` listeners fired 80 times across the scale change and the pan together; a subsequent pinch added 93. `window`'s `scroll` event fired zero times throughout.

### §3.3 Desktop context — EXACTLY the CI project (`devices["Desktop Chrome"]`, no touch)

| state | `innerWidth/Height` | `vv` w/h/offL/offT/scale | element rect |
|---|---|---|---|
| baseline | 1280 / 720 | 1280 / 720 / 0 / 0 / 1 | 170, 360 |
| `Emulation.setPageScaleFactor 3` | 1280 / 720 | 426.7 / 240 / 0 / 0 / 3 | 170, 360 |
| `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`) | 1280 / 720 | 426.7 / 240 / 120 / 180 / 3 | 170, 360 |
| `Input.synthesizePinchGesture` | unchanged — **no-op without touch** | | |

**This is why §5's e2e drives `setPageScaleFactor` + `synthesizeScrollGesture(mouse)` and NOT `synthesizePinchGesture`.** The pinch gesture works only in the touch-enabled context of §3.1; under the shipped standalone project it silently does nothing, which would produce a test that passes while proving nothing.

### §3.4 WebKit coordinate convention — upstream source read

Verbatim from the Floating UI `getViewportRect` utility (fetched 2026-07-24, `master`):

```ts
// Client coordinates are relative to the layout viewport, except in
// WebKit with an `absolute` strategy, where they are relative to the
// visual viewport.
const layoutRelativeClientCoords = !isWebKit() || strategy === 'fixed';
…
width = visualViewport.width;
height = visualViewport.height;
if (layoutRelativeClientCoords) {
  x = visualViewport.offsetLeft;
  y = visualViewport.offsetTop;
}
```

The non-WebKit branch matches §3.1/§3.3 exactly, which is the evidence that this read is being applied correctly. The detector itself was also measured, not assumed: probe 1 evaluated `CSS.supports("-webkit-backdrop-filter", "none")` in Chromium and it returned **false**, so Chromium's aliasing of `-webkit-` prefixed properties does not misfire this gate and Chromium keeps the visual-viewport path. Both consumers position `position: absolute` bodies through an offsetParent-relative conversion, i.e. the `absolute` strategy — so on WebKit the client rects are already visual-relative. Round 1 established that correcting only the bounds origin is insufficient there: the body-host conversion adds `window.scrollX` (HoverHelp.tsx:283-290), which converts a LAYOUT-relative client point to document coordinates, and a visual-relative point would additionally need the visual offset. None of that is measurable in this repo's harness, so R5 excludes WebKit entirely rather than guessing.

### §3.5 States where the visual viewport differs from the layout viewport at scale 1

Two are documented (MDN `VisualViewport`; the Chromium WPT `viewport-dimensions-scrollbars-manual` case): classic non-overlay scrollbars, where `innerWidth` includes the scrollbar gutter that `visualViewport.width` excludes; and an on-screen keyboard, which shrinks the visual viewport without any zoom.

**Not reproduced in this repo's harness.** A fourth probe launched headless Chromium both with default flags and with `--disable-features=OverlayScrollbar,FluentOverlayScrollbar` over a 4000px-tall page; both reported `innerWidth 1280` and `visualViewport.width 1280`, delta 0 — headless macOS Chromium uses overlay scrollbars regardless. So this spec treats the scrollbar case as documented-but-unreproduced, and the OSK case as documented and untested. R7 ratifies the resulting behavior in both rather than asserting they cannot occur.

## §4 Design

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
### §4.1 New module `lib/popover/viewport.ts`

One exported function, shared by both consumers. It lives OUTSIDE `lib/popover/position.ts` because that module's contract is pure placement algebra with no environment reads (lib/popover/position.ts:1-14); this one reads the window. It takes the window as a parameter so tests inject a plain stub.

```ts
export function visibleViewportRect(win: Window): Rect;
```

Returns the rectangle a popover may occupy, **in the same coordinate space as `getBoundingClientRect()`** — that equivalence is the whole contract.

Resolution order:

1. `layoutRect(win)` = `{ left: 0, top: 0, width: win.innerWidth, height: win.innerHeight, right: win.innerWidth, bottom: win.innerHeight }` — today's rect.
2. **WebKit → `layoutRect(win)`** (R5). Detected as `win.CSS?.supports?.("-webkit-backdrop-filter", "none") === true`.
3. `const vv = win.visualViewport`. Falsy → `layoutRect(win)`.
4. `vv.width`/`vv.height` non-finite or `<= 0` → `layoutRect(win)`.
5. Otherwise `{ left: finiteOr0(vv.offsetLeft), top: finiteOr0(vv.offsetTop), width: vv.width, height: vv.height, right: left + width, bottom: top + height }`.

**Guard table** (every input state):

| input state | result | why |
|---|---|---|
| WebKit (`CSS.supports("-webkit-backdrop-filter","none")`) | layout rect | R5 — the full transform is unverifiable there; today's behavior preserved exactly |
| `win.visualViewport` undefined (jsdom, older browsers) | layout rect | preserves today's behavior; no feature detection at the call site |
| `win.visualViewport` null | layout rect | same |
| `vv.width` or `vv.height` `NaN` / `Infinity` | layout rect | a degenerate vv must not become a degenerate bounds; the core would gate it to `hidden` (lib/popover/position.ts:110) and the popover would vanish — strictly worse than today |
| `vv.width` or `vv.height` `<= 0` | layout rect | same |
| `vv.offsetLeft` / `offsetTop` non-finite | coerced to `0`, vv size retained | partial degradation beats total |
| `win.CSS` undefined, or `CSS.supports` undefined | not WebKit → continue to step 3 | matches every engine lacking `CSS.supports` |
| visual viewport equals the layout viewport, zero offsets | rect deep-equal to the layout rect | the R7 guarantee, asserted by T-U7 |

The WebKit check is NOT cached in module scope: caching would leak across unit tests exercising both branches, and `CSS.supports` runs at most once per animation frame.

### §4.2 Shell integration — BOTH consumers

One substitution each, identical in shape.

- `components/admin/HoverHelp.tsx:226-233` → `const viewportRect = visibleViewportRect(window);`
- `components/admin/showpage/ShareHub.tsx:247-253` → the same.

Everything downstream is untouched in both: `hostRect` still degenerates to `viewportRect` for the body host, `bounds` is still `insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET)`, and the host-offset conversions are unchanged because the returned rect is in client coordinates by contract (§4.1) and, on the one engine where that contract would not hold, step 2 returns the layout rect so the existing conversion stays exactly as correct as it is today.

Panel hosts compose by intersection, so a popover inside the review modal is bounded by `panel ∩ visible slice` — the tighter of the two, which is correct.

### §4.3 Reposition listeners

Added to each consumer's open-effect, alongside its existing `window` listeners (HoverHelp :332-333; ShareHub :372):

```ts
const vv = window.visualViewport;
vv?.addEventListener("scroll", schedule);
vv?.addEventListener("resize", schedule);
```

removed symmetrically in the same cleanup block (HoverHelp :339-340; ShareHub :404). `vv` is captured once in the effect body and reused by the cleanup closure, so add and remove cannot target different objects; `schedule` is the single instance captured by that effect run, the same symmetry the existing `window` listeners already rely on.

Existing `window` listeners STAY — they carry ordinary document scrolling and window resizes, which visual-viewport events do not replace. ShareHub's lack of a `window` `scroll` listener is pre-existing and out of scope (§8).

Both feed the existing rAF coalescers unchanged. §3.1 finding (e) is the justification: 80 events per pan collapse to one measurement per frame.

### §4.4 Consequences

| situation | behavior | mechanism |
|---|---|---|
| unzoomed, visual == layout | identical to today | §4.1 step 5 equality |
| unzoomed, classic scrollbars or OSK shrink the visual viewport | bounded by the genuinely visible area — intended (R7) | §4.1 step 5 |
| WebKit, any zoom | identical to today; no fix, no regression | §4.1 step 2 (R5) |
| zoomed, popover fits the visible slice | placed fully inside it, possibly narrower | lib/popover/position.ts:118-121 |
| zoomed, popover taller than the visible slice | `maxHeight` cap + internal scroll | lib/popover/position.ts:130-133 |
| zoomed past ~10x, bounds narrower than the irreducible box | stays placed and anchored, exceeds bounds | R9 |
| user pans while open | repositions on the next frame | §4.3 |
| user pans the trigger off the visible slice | hides; reappears on panning back | R4; lib/popover/position.ts:112 |
| focus inside the body when it hides | closes, returns focus to the trigger | unchanged, HoverHelp.tsx:259-264 |
| no `visualViewport` | today's behavior exactly | §4.1 step 3 |

### §4.5 Numeric inventory (single source of truth)

Two pre-existing constants govern placement: `VIEWPORT_INSET = 8` and `GAP = 6` (lib/popover/position.ts:17,16). This spec introduces **no new numeric constant**. The R9 floors (30px, 22px) are DERIVED from committed class strings and are documentation, not values any implementation may hardcode. Every figure in §3 is probe output.

### §4.6 Dimensional Invariants

**None — this change introduces no dimension relationship.** The section is answered rather than waived because both changed files are genuine UI paths.

Neither popover body's box changes: HoverHelp's `w-72 max-w-[80vw] max-h-[min(60vh,24rem)]` (:576) and ShareHub's `w-[308px] max-h-[min(70vh,30rem)]` (:699) are untouched. The only geometry written is `left`/`top`/`maxWidth`/`maxHeight` as inline styles on `position: absolute` elements participating in no flex or grid parent — so the Tailwind-v4 `align-items` caveat that motivates this section has no surface here. The one box-model fact that DOES bite is the irreducible padding+border floor, specified as R9 and tested in §5.

### §4.7 Transition Inventory

**None — no visual state and no state transition is introduced.** Each popover's three states (closed, open-and-placed, open-but-collision-hidden) and every transition between them are unchanged, as is their fade treatment (HoverHelp.tsx:576-578 and :622-624). Zoom and pan change only WHERE a state is painted, never WHICH state is active. The one state entry this change can newly cause — open-and-placed becoming collision-hidden because the trigger was panned out of the visible slice (R4) — enters through the already-shipped `overlapsPositively` gate and reuses that path's existing treatment.

### §4.8 Deliberately N/A

| self-review section | why N/A |
|---|---|
| Tier x domain matrix, CHECK/enum matrix | no DB surface |
| Flag lifecycle table | no config flag or toggle |
| Cap/truncation | no list rendered |
| §12.4 catalog | no error code, no user-visible copy |
| Mutation-surface telemetry (invariant 10) | no mutation surface |
| Advisory locks (invariant 2) | no DB mutation path |

## §5 Tests

Anti-tautology governs every assertion: expected values derive from live measurements and exported constants, never from literals.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Unit — `tests/lib/popover/viewport.test.ts` (new).** One case per guard-table row:
- T-U1 no `visualViewport` (undefined and null) → layout rect, all six fields.
- T-U2 non-WebKit with offsets → size from vv, origin from offsets, `right`/`bottom` consistent.
- T-U3 **WebKit → layout rect** (R5), asserting the visual size is NOT adopted. Replaces round 1's origin-only WebKit case, which F1 showed was testing the wrong thing.
- T-U4 `NaN` / `Infinity` / zero / negative dimensions → layout rect.
- T-U5 non-finite offsets → offsets 0, vv size retained.
- T-U6 `CSS` absent, and `CSS` without `supports` → non-WebKit path.
- T-U7 equal-dimensions identity: a vv equal to `innerWidth`/`innerHeight` with zero offsets returns a rect deep-equal to the no-`visualViewport` result (the R7 guarantee, stated as the conditional it actually is).
- T-U8 scrollbar-shaped case: `innerWidth` 1280 with `vv.width` 1265 → the returned width is **1265**, pinning R7's ratified preference for the visible area.

**Unit — `tests/lib/popover/position.test.ts` (extend).** Two cases, no source change (R6):
- narrow bounds → `kind: "placed"` with both `maxWidth` and `maxHeight` set, NOT `hidden` (R3).
- bounds narrower than the R9 floor → still `kind: "placed"`, pinning R9's ratified posture as defined behavior rather than accident.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Component — `tests/components/admin/hoverHelpVisualViewport.test.tsx` (new, jsdom).** Reuses the `stubRect` idiom at `tests/components/admin/hoverHelpLifecycle.test.tsx:157`. The stubbed visible slice is both smaller than AND offset from the layout viewport, so a layout-viewport implementation and a visual-viewport one cannot agree.
- T-C1 applied `left`/`top`/`maxWidth`/`maxHeight` fall inside the stubbed slice inset by `VIEWPORT_INSET`, all derived; plus a negative assertion naming the value the old implementation would have written.
- T-C2 **both** event types, independently: a `visualViewport` `scroll` schedules exactly one frame; a `resize` schedules one; either while CLOSED schedules none.
- T-C3 after close, dispatching **both** event types **on the originally captured viewport object** schedules no frame. F5 is right that spying on `removeEventListener` alone proves nothing — inertness of the original target is the assertion that does.
- T-C4 no `visualViewport` → still opens and positions against the layout viewport.
- T-C5 a WebKit-shaped stub (`CSS.supports` true) → placement matches the layout-viewport answer, pinning R5 at the component layer.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Component — `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` (new, jsdom).** The R10 consumer gets the same T-C1 / T-C2 / T-C3 trio against its own popover. Without this, ShareHub is changed but unproven.

**e2e — `tests/e2e/hoverhelp-geometry.spec.ts` (extend; already in the standalone allow-list).** Chromium, via `context.newCDPSession(page)`. F4 governs the design: containment alone is a weak oracle, so every case asserts a **uniquely derivable expected coordinate**, not a range.
- **T-VV1 (body host)** — zoom to a **saturating** scale, chosen so the pre-change placement provably lies outside the zoomed bounds (at 1280px wide, scale 2.5 leaves ~512px, which a 288px popover fits inside — that is exactly the non-discriminating fixture F4 named). Pan first so `offsetLeft/offsetTop` are both non-zero, then assert the body's exact `left`/`top` equal the values recomputed in-page from the live `visualViewport` rect, the live trigger rect, `GAP`, and `VIEWPORT_INSET`, within `TOL`. Exact equality is what kills the double-add mutation, which containment does not.
- **T-VV2 (panel host)** — the same, using the existing `PaneCase` fixture (`tests/e2e/_hoverHelpGeometryLiveEntry.tsx:112`), so both halves of the two-host coordinate claim are proven. Bounds are `panel ∩ visible slice`.
- **T-VV3 (pan tracking)** — assert FIRST that the gesture actually moved `visualViewport.offsetLeft/offsetTop` (guarding against the silent no-op §3.3 documents), THEN that the popover's new exact coordinates match the recomputation.
- **T-VV4 (unzoomed restore)** — `setPageScaleFactor 1`; the popover returns to the rect recorded before any zoom, within `TOL`.
- Teardown resets page scale to 1 so a failure cannot leak zoom state into later tests in this serial file.
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- **Durable mutation kill (F4).** The one-shot uncommitted negative run round 1 rejected is replaced by a committed guard: `tests/lib/popover/viewportMutants.test.ts` asserts that a double-added offset and a layout-viewport origin each produce a rect DIFFERENT from `visibleViewportRect`'s, so the oracle's discriminating power is itself pinned in CI rather than attested in a PR body.

**Note on the harness's `getBoundingClientRect` ban.** That file bans it as a CLIPPING/visibility proof (:19-21) and uses `document.elementFromPoint`. These assertions are viewport-coordinate arithmetic, not clipping proofs, and `elementFromPoint` cannot express them — its coordinates are visual-viewport-relative under zoom while rects are layout-relative (§3.1), so mixing them would be the actual error.

## §6 CI wiring

`.github/workflows/hoverhelp-geometry-e2e.yml`'s `pull_request` path filter already lists `components/admin/HoverHelp.tsx` and `lib/popover/position.ts`. Two entries MUST be added in the same commit that creates or changes them, or a later edit will not fire the only gate that can catch a zoom-geometry regression:

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- `lib/popover/viewport.ts`
- `components/admin/showpage/ShareHub.tsx`

`tests/e2e/_hoverHelpGeometryLiveEntry.tsx` is already listed and needs no change.

ShareHub's own behavior is otherwise covered by the standard vitest suite; no workflow gates it today.

## §7 Acceptance criteria

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-1 `lib/popover/viewport.ts` exports `visibleViewportRect(win: Window): Rect` satisfying every row of the §4.1 guard table, including the WebKit layout-rect branch.
- AC-2 BOTH `components/admin/HoverHelp.tsx` and `components/admin/showpage/ShareHub.tsx` build bounds from `visibleViewportRect(window)`; no `window.innerWidth`/`innerHeight` read remains in either.
- AC-3 In both consumers, `visualViewport` `scroll` and `resize` feed the existing coalescer and are removed symmetrically on close, proven by post-close inertness.
- AC-4 `lib/popover/position.ts` is unmodified (R6).
- AC-5 Equal-dimension no-op proven by T-U7 and T-VV4; the non-equal scale-1 states are ratified as intended (R7), not asserted away.
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-6 `lib/popover/viewport.ts` and `components/admin/showpage/ShareHub.tsx` appear in the `hoverhelp-geometry-e2e.yml` path filter.
- AC-7 `BACKLOG.md` row `BL-HOVERHELP-VISUAL-VIEWPORT` marked closed with the PR reference.
- AC-8 `2026-07-22-hoverhelp-smart-position` §1.1 R8 carries a superseded-by pointer to this spec.
- AC-9 The impeccable critique + audit pair has run on the diff (invariant 8), dispositions in the PR body.

## §8 Out of scope

- **WebKit / iOS Safari** (R5) — excluded by design, not overlooked.
- ShareHub's missing `window` `scroll` listener (§2) — pre-existing asymmetry with HoverHelp; unrelated to zoom.
- Any change to which side a popover opens on, its width token, or its copy.
