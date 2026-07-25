# HoverHelp — position against the visual viewport under pinch-zoom

**Date:** 2026-07-24
**Status:** draft (round 1), pre-adversarial-review
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT` (BACKLOG.md:43-49)
**Supersedes:** `2026-07-22-hoverhelp-smart-position` §1.1 R8 (that spec's line 30) — see §1.1 R2 below
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24, brainstorming gate); spec + plan user-review gates waived.

---

## §1 Problem

`HoverHelp`'s measure path builds its bounds rectangle from the LAYOUT viewport:

```ts
const viewportRect: Rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: …, bottom: … };
const hostRect = host === document.body ? viewportRect : toRect(host.getBoundingClientRect());
const bounds = insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET);
```

(components/admin/HoverHelp.tsx:226-239.)

Pinch-zoom does not change the layout viewport — `window.innerWidth/innerHeight` are constant across every zoom level (§3, measured). It changes the VISUAL viewport: a smaller, offset window onto the same layout. So an open popover is placed inside a rectangle that is partly off-screen, and the user sees a clipped popover whose missing text cannot be scrolled to. Zoom-pan also does not fire `window`'s `scroll` event (§3, measured: `window.scrollX/scrollY` stay `0,0` through a full pan), so an already-open popover does not reposition as the user pans.

Goal: an open popover is fully inside the part of the page the user can actually see, at any zoom level, and repositions as they pan.

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | **Behavior: the visible slice becomes the bounds for BOTH sizing and position.** Under zoom the popover narrows, wraps taller, and scrolls past its `maxHeight` cap. Two alternatives were considered and rejected: clamping position only (keeps the 288px width, leaves the right side permanently cut off with no way to scroll to it) and a fits-or-fallback threshold (never engages at the zoom levels that cause the problem) | User choice, brainstorming 2026-07-24, against a rendered side-by-side mockup of all three at 1.5x and 3.5x |
| R2 | This spec SUPERSEDES `2026-07-22-hoverhelp-smart-position` §1.1 R8 ("positioning is computed against the LAYOUT viewport … the user pans"). R8 explicitly filed its own successor as `BL-HOVERHELP-VISUAL-VIEWPORT`; this is that successor, so the supersession is the ratified path, not a reversal | smart-position spec line 30; BACKLOG.md:43-49 |
| R3 | **Narrowing is not a regression to be fixed.** At 3.5x zoom the visible slice is ~111 CSS px wide, so the popover renders as a narrow scrolling column. That column is MAGNIFIED 3.5x on screen, so its text is larger than the unzoomed popover's, and every word remains reachable by scrolling. A width floor was considered and rejected: it would guarantee horizontal overflow with no horizontal scroll, i.e. permanently unreachable text | Brainstorming 2026-07-24; mockup rows at 1.5x/3.5x |
| R4 | **Panning the trigger out of the visible slice hides the popover.** This falls out of the existing `overlapsPositively(trigger, bounds)` gate (lib/popover/position.ts:112) once bounds are the visible slice. It is correct — the popover is an anchored annotation on something no longer on screen — and it self-heals: panning back re-places it on the next `visualViewport` scroll event. Focus-inside-body takes the already-shipped close-and-restore-focus path (HoverHelp.tsx:259-264), unchanged | This spec |
| R5 | **The WebKit origin branch is not provable in this repo's harness and does not need to be.** Playwright's WebKit exposes no CDP, so no visual viewport can be driven there. The branch rests on a verbatim read of upstream Floating UI source (§3.4) plus a stubbed unit test. Do NOT request a live WebKit proof; it cannot be produced. Chromium is proven live (§5 T-VV1..T-VV3) | This spec; §3.4 citation |
| R6 | **`lib/popover/position.ts` is not modified.** `bounds` is already an input to `computePopoverPlacement` (lib/popover/position.ts:46), and every consequence of a smaller bounds rect — narrower `maxWidth`, taller wrap, side flip, `maxHeight` cap, hidden gate — already falls out of the shipped algebra. Changing the pure core would be scope the problem does not require | lib/popover/position.ts:100-156 |
| R7 | **At scale 1 the change is a no-op by construction.** `visualViewport.width/height` equal `innerWidth/innerHeight` and both offsets are 0 when unzoomed (§3.1, measured). The regression surface is zoomed states only; every existing geometry assertion holds unchanged | §3.1 |
| R8 | This is a geometry change with **no new visual states, no new rendered elements, no new copy, and no new tokens**. The N/A declarations in §4.6-§4.8 are deliberate, not omissions | §4.6-§4.8 |

## §2 Current state (citations verified against worktree `fix/hoverhelp-visual-viewport` @ b58fb0966)

- Measure path: `measureAndApply` at `components/admin/HoverHelp.tsx:218`; layout-viewport rect built at :226-233; host rect at :238; bounds at :239.
- Reposition listeners registered in the open-effect: `window` `scroll` (capture, passive) at `components/admin/HoverHelp.tsx:332`, `window` `resize` at :333, `ResizeObserver` over trigger/body/host at :334-337; symmetric teardown at :339-344.
- Coalescer: `schedule()` at `components/admin/HoverHelp.tsx:314-320` — no-op while closed or while a frame is pending; clears `frameRef` BEFORE running so later events can schedule anew.
- Pure core: `computePopoverPlacement` at `lib/popover/position.ts:100`; `bounds` documented as `intersect(hostRect, viewportRect)` inset by `VIEWPORT_INSET` at :46; `VIEWPORT_INSET = 8` at :17; hidden gates at :104-115 (including `overlapsPositively(trigger, bounds)` at :112); width-first sizing at :118-121; x-clamp at :138-139.
- `Rect` type: `lib/popover/position.ts:30-37` (`left/top/width/height/right/bottom`).
- Existing pure-core unit suite: `tests/lib/popover/position.test.ts`.
- Existing real-engine harness: `tests/e2e/hoverhelp-geometry.spec.ts` + `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`; runs standalone via `tests/e2e/standalone.config.ts`, script `pnpm test:e2e:hoverhelp-geometry` (package.json:60). The standalone `testMatch` allow-list already contains `hoverhelp-geometry` (tests/e2e/standalone.config.ts), so extending the EXISTING spec file needs no allow-list edit.
- Standalone project: a single `standalone-chromium` project using `devices["Desktop Chrome"]` — no `isMobile`, no `hasTouch`. This constrains the zoom mechanism (§3.3).
- CI gate: `.github/workflows/hoverhelp-geometry-e2e.yml`, `pull_request` path filter already lists `components/admin/HoverHelp.tsx` and `lib/popover/position.ts`, plus `workflow_dispatch`.
- No other source file positions anything against the viewport: `grep -rn "innerWidth\|innerHeight\|visualViewport" lib components app` returns only HoverHelp.tsx:229-232, `components/admin/dev/DevCaptureControl.tsx:98-99` (records viewport size into a capture payload — not positioning), and a comment at `components/agenda/AgendaPdfViewer.tsx:15`. No class-sweep target exists.

## §3 Empirical probe (ran 2026-07-24, pre-spec)

Per the mandatory spike rule (docs/agents/spec-self-review.md:21) — this surface is undocumented framework behavior, so it is measured, not reasoned about. Three probe runs, Playwright 1.59.1 + Chromium, driving CDP directly.

### §3.1 Mobile context (`viewport 390x780`, `isMobile`, `hasTouch`, `deviceScaleFactor 2`)

| state | `innerWidth/Height` | `vv.width/height` | `vv.offsetLeft/Top` | `scrollX/Y` | element rect |
|---|---|---|---|---|---|
| baseline | 390 / 780 | 390 / 780 | 0 / 0 | 0 / 0 | 170, 360 |
| `setPageScaleFactor 3` | 390 / 780 | 130 / 260 | 0 / 0 | 0 / 0 | 170, 360 |
| after pan | 390 / 780 | 130 / 260 | 0 / 150 | 0 / 0 | 170, 360 |
| `synthesizePinchGesture 2.5` | 390 / 780 | 156 / 312 | 117 / 234 | 0 / 0 | 170, 360 |

Findings: (a) the layout viewport is invariant under zoom; (b) `visualViewport` reports the visible slice and its offset; (c) **`getBoundingClientRect()` is layout-viewport-relative in Chromium** — the probe element's rect never moved, for a `position: absolute` element AND for a `position: fixed` one; (d) `window.scrollX/scrollY` never change, so `window`'s `scroll` event cannot carry a zoom-pan; (e) one pan emitted **80** `visualViewport` events — the existing rAF coalescer is load-bearing, not decorative.

### §3.2 Event coverage

`visualViewport` `scroll` + `resize` listeners fired 80 times across the scale change and the pan together; a subsequent pinch added 93. `window`'s `scroll` event fired zero times throughout.

### §3.3 Desktop context — EXACTLY the CI project (`devices["Desktop Chrome"]`, no touch)

| state | `innerWidth/Height` | `vv` w/h/offL/offT/scale | element rect |
|---|---|---|---|
| baseline | 1280 / 720 | 1280 / 720 / 0 / 0 / 1 | 170, 360 |
| `Emulation.setPageScaleFactor 3` | 1280 / 720 | 426.7 / 240 / 0 / 0 / 3 | 170, 360 |
| `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`) | 1280 / 720 | 426.7 / 240 / 120 / 180 / 3 | 170, 360 |
| `Input.synthesizePinchGesture` | unchanged — **no-op without touch** | | |

**This is why the e2e drives `setPageScaleFactor` + `synthesizeScrollGesture(mouse)` and NOT `synthesizePinchGesture`.** The pinch gesture works only in the touch-enabled context of §3.1; under the shipped standalone project it silently does nothing, which would produce a test that passes while proving nothing.

### §3.4 WebKit coordinate convention — upstream source read

<!-- spec-lint: ignore — upstream third-party path, deliberately not a file in this repo -->
Verbatim from `floating-ui/packages/dom/src/utils/getViewportRect.ts` (fetched 2026-07-24, `master`):

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

<!-- spec-lint: ignore — upstream third-party path, deliberately not a file in this repo -->
with (`floating-ui/packages/utils/src/dom.ts`):

```ts
export function isWebKit(): boolean {
  … CSS.supports('-webkit-backdrop-filter', 'none') …
}
```

The non-WebKit branch matches §3.1/§3.3 exactly (offsets applied, size from `visualViewport`), which is the evidence that this read is being applied correctly. `HoverHelp`'s body is `position: absolute` (HoverHelp.tsx:576) and its host conversion is offsetParent-relative (HoverHelp.tsx:283-290), i.e. the `absolute` strategy — so on WebKit the offsets are already baked into the client rects and the origin must stay `0,0`. See R5 for why this branch is not live-tested.

## §4 Design

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
### §4.1 New module `lib/popover/viewport.ts`

One exported function. It lives OUTSIDE `lib/popover/position.ts` because that module's header contract is pure placement algebra with no environment reads (lib/popover/position.ts:1-14); this function reads `window`. It takes the window as a parameter so tests inject a plain stub rather than mutating globals.

```ts
export function visibleViewportRect(win: Window): Rect;
```

Returns the rectangle the popover may occupy, **in the same coordinate space as `getBoundingClientRect()`** — that equivalence is the whole contract, and §3.4 is why it needs an engine branch.

Resolution order:

1. `layoutRect(win)` = `{ left: 0, top: 0, width: win.innerWidth, height: win.innerHeight, right: win.innerWidth, bottom: win.innerHeight }` — today's rect, byte-identical to HoverHelp.tsx:226-233.
2. `const vv = win.visualViewport`. If falsy → return `layoutRect(win)`.
3. If `vv.width`/`vv.height` are non-finite or `<= 0` → return `layoutRect(win)`.
4. Origin: `webkit ? { x: 0, y: 0 } : { x: finiteOr0(vv.offsetLeft), y: finiteOr0(vv.offsetTop) }`, where `webkit` = `win.CSS?.supports?.("-webkit-backdrop-filter", "none") === true`.
5. Return `{ left: x, top: y, width: vv.width, height: vv.height, right: x + vv.width, bottom: y + vv.height }`.

**Guard table** (every input state, per docs/agents/spec-self-review.md:7):

| input state | result | why |
|---|---|---|
| `win.visualViewport` undefined (jsdom, older browsers) | layout rect | preserves today's behavior exactly; no feature detection at the call site |
| `win.visualViewport` null | layout rect | same |
| `vv.width` or `vv.height` is `NaN` / `Infinity` | layout rect | a degenerate vv must not become a degenerate bounds; the core would return `hidden` (lib/popover/position.ts:110) and the popover would vanish — strictly worse than today |
| `vv.width` or `vv.height` `<= 0` | layout rect | same |
| `vv.offsetLeft` / `offsetTop` non-finite | treated as `0`, vv size still used | partial degradation beats total; an unzoomed page has offset 0 anyway |
| `win.CSS` undefined, or `CSS.supports` undefined | `webkit = false` → offsets applied | matches every engine that lacks `CSS.supports`; Chromium/Gecko are the non-WebKit branch |
| `win.innerWidth`/`innerHeight` non-finite (fallback path) | returned as-is | unchanged from today: `finiteRect` (lib/popover/position.ts:104) gates it to `hidden` |
| unzoomed (`scale === 1`) | `vv.width === innerWidth`, offsets 0 → identical rect to the layout rect | R7; the no-op guarantee |

The WebKit check is NOT cached in module scope. Caching would leak across unit tests that exercise both branches, and `CSS.supports` is called at most once per animation frame.

### §4.2 Shell integration (`components/admin/HoverHelp.tsx`)

Exactly one substitution inside `measureAndApply`. Lines :226-233 become:

```ts
const viewportRect = visibleViewportRect(window);
```

Everything downstream is untouched: `hostRect` still degenerates to `viewportRect` for the body host (:238), `bounds` is still `insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET)` (:239), and the host-offset conversion at :283-290 is unchanged because the returned rect is in client coordinates by contract (§4.1).

The `host === document.body` degeneration keeps its existing rationale (an all-absolute page gives `document.body` a zero-height rect) and now additionally means the body host is bounded by the visible slice, which is the intended fix. Panel hosts compose by intersection, so a popover in the review modal is bounded by `panel ∩ visible slice` — the tighter of the two, which is correct.

### §4.3 Reposition listeners

Added inside the existing open-effect (`components/admin/HoverHelp.tsx:325-367`), alongside the `window` listeners at :332-333:

```ts
const vv = window.visualViewport;
vv?.addEventListener("scroll", schedule);
vv?.addEventListener("resize", schedule);
```

with symmetric removal in the same cleanup block that already removes the `window` listeners (:339-340). The existing `window` `scroll`/`resize` listeners STAY — they carry ordinary document scrolling and window resizes, which `visualViewport` events do not replace.

Both feed the existing `schedule()` coalescer unchanged (:314-320). §3.1 finding (e) is the justification: 80 events per pan collapse to one measurement per frame.

Guard: `window.visualViewport` may be absent (jsdom). Optional-call (`?.`) on both add and remove; absent means the popover simply does not reposition on zoom-pan, which is today's behavior.

### §4.4 Consequences (all ratified in §1.1)

| situation | behavior | mechanism |
|---|---|---|
| unzoomed | identical to today | R7 / the §4.1 step 5 equality |
| zoomed, popover fits the visible slice | placed fully inside it, possibly narrower than 288px | existing width-first sizing, lib/popover/position.ts:118-121 |
| zoomed, popover taller than the visible slice | `maxHeight` cap + internal scroll | existing lib/popover/position.ts:130-133 |
| user pans while open | repositions on the next frame | §4.3 listeners |
| user pans the trigger off the visible slice | popover hides; reappears on panning back | R4; existing `overlapsPositively` gate at lib/popover/position.ts:112 |
| focus is inside the body when it hides | closes and returns focus to the trigger | unchanged path, HoverHelp.tsx:259-264 |
| browser without `visualViewport` | today's behavior exactly | §4.1 step 2 |

### §4.5 Numeric inventory (single source of truth)

Only two numbers belong to this change, and both are pre-existing: `VIEWPORT_INSET = 8` (lib/popover/position.ts:17) and `GAP = 6` (:16). This spec introduces **no new numeric constant**. Every measured figure in §3 is probe output, not a design value; no implementation may hardcode one.

### §4.6 Dimensional Invariants

**None — this change introduces no dimension relationship.** The required section is present and answered rather than waived, because `components/admin/HoverHelp.tsx` is a genuine UI path and the reviewer is entitled to see the question asked.

The popover body's box is untouched: `w-72 max-w-[80vw] max-h-[min(60vh,24rem)]` (HoverHelp.tsx:576) is unchanged, and no parent/child dimension relationship is created. The only geometry this spec writes is `left` / `top` / `maxWidth` / `maxHeight` as inline styles on a `position: absolute` element, which participates in no flex or grid parent — so the Tailwind-v4 `align-items` caveat that motivates this section has no surface here. Both inline caps are computed by the pure core and already covered by `tests/lib/popover/position.test.ts`; the real-engine equivalents are §5's T-VV1..T-VV3.

### §4.7 Transition Inventory

**None — this change introduces no visual state and no state transition.** The popover's three states (closed, open-and-placed, open-but-collision-hidden) and every transition between them are unchanged, as is their fade treatment: `transition-[opacity,display] duration-fast transition-discrete starting:opacity-0` on the body (HoverHelp.tsx:576-578) and the matching treatment on the caret (HoverHelp.tsx:622-624). Zoom and pan change only WHERE a state is painted, never WHICH state is active. The one state entry this change can newly cause — open-and-placed becoming collision-hidden because the trigger was panned out of the visible slice (R4) — enters through the already-shipped `overlapsPositively` gate and reuses that path's existing treatment unchanged.

### §4.8 Deliberately N/A

| self-review section | why N/A |
|---|---|
| Tier x domain matrix, CHECK/enum matrix | no DB surface |
| Flag lifecycle table | no config flag or toggle |
| Cap/truncation | no list rendered |
| §12.4 catalog | no error code, no user-visible copy |
| Mutation-surface telemetry (AGENTS.md invariant 10) | no mutation surface; nothing is written |
| Advisory locks (invariant 2) | no DB mutation path |

## §5 Tests

Anti-tautology rule applies to every assertion: expected values derive from live measurements and the exported constants, never from literals.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Unit — `tests/lib/popover/viewport.test.ts` (new).** One case per row of the §4.1 guard table, each with a plain object stub cast to `Window`:
- T-U1 no `visualViewport` → layout rect, all six fields.
- T-U2 `visualViewport` present, non-WebKit stub → size from vv, origin from offsets, `right`/`bottom` consistent with `left + width` / `top + height`.
- T-U3 WebKit stub (`CSS.supports` returns true for `-webkit-backdrop-filter`) → same size, origin `0,0`. This is the R5 branch's only proof.
- T-U4 `NaN` width, `Infinity` height, `0` width, negative height → layout rect in all four.
- T-U5 non-finite offsets → offsets become 0, vv size retained.
- T-U6 `win.CSS` absent → non-WebKit branch.
- T-U7 scale-1 identity: a vv whose size equals `innerWidth/innerHeight` with zero offsets returns a rect deep-equal to the no-`visualViewport` result. This is the R7 no-op guarantee as an executable assertion.

**Unit — `tests/lib/popover/position.test.ts` (extend).** One case pinning that a bounds rect narrower than the natural body width yields `kind: "placed"` with both a `maxWidth` and a `maxHeight`, NOT `hidden` — the R3 "narrow but never absent" contract, asserted at the layer that owns it. Failure mode caught: a future change to the hidden gates silently making zoomed popovers vanish.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Component — `tests/components/admin/hoverHelpVisualViewport.test.tsx` (new, jsdom).**
- T-C1 with a stubbed `window.visualViewport` (offset + smaller size), open the popover and assert the applied inline `left`/`top` fall inside the stubbed visible rect inset by `VIEWPORT_INSET`. Expected bounds derived from the stub, not hardcoded.
- T-C2 dispatching a `scroll` event on the stubbed `visualViewport` schedules a reposition (assert `requestAnimationFrame` was called / position updated after flush). Failure mode caught: listener registered on the wrong target.
- T-C3 closing the popover removes both `visualViewport` listeners (spy on `removeEventListener`). Failure mode caught: leak across open/close cycles.
- T-C4 no `visualViewport` on `window` → component still opens and positions (no crash). Failure mode caught: a non-optional `.addEventListener` call.

**e2e — `tests/e2e/hoverhelp-geometry.spec.ts` (extend the existing file; no allow-list edit needed).** Chromium, via `context.newCDPSession(page)`:
- T-VV1 open a popover; record its rect; `Emulation.setPageScaleFactor 2.5`; assert the body's rect is inside `visualViewport` inset by `VIEWPORT_INSET`, with the expected rect read live from `window.visualViewport` in-page and compared within `TOL`.
- T-VV2 then `Input.synthesizeScrollGesture` with `gestureSourceType: "mouse"` (§3.3 — NOT `synthesizePinchGesture`); assert (a) `visualViewport.offsetLeft/offsetTop` actually moved, so the gesture is not silently a no-op, and (b) the popover's rect moved with it and is again inside the visible slice. Failure mode caught: listeners absent, popover frozen.
- T-VV3 `setPageScaleFactor 1`; assert the popover returns to the rect recorded before T-VV1 within `TOL`. This is the R7 no-op guarantee in a real engine.
- Negative-regression check (run once during implementation, recorded in the PR body, not committed as a test): T-VV1 must FAIL against the pre-change `measureAndApply`.

**Note on the harness's `getBoundingClientRect` ban.** The existing file bans `getBoundingClientRect` as a CLIPPING/visibility proof (tests/e2e/hoverhelp-geometry.spec.ts:19-21, because it lies about ancestor clipping) and uses `document.elementFromPoint` instead. These new assertions are viewport-containment arithmetic, not clipping proofs, and `elementFromPoint` cannot express them — its coordinates are visual-viewport-relative under zoom while the rects are layout-relative (§3.1), so mixing the two is the actual error to avoid. Rect math against `visualViewport` is the correct instrument here.

## §6 CI wiring

<!-- spec-lint: ignore — names lib/popover/viewport.ts, created BY this spec; not tracked until implementation lands -->
`.github/workflows/hoverhelp-geometry-e2e.yml`'s `pull_request` path filter already lists `components/admin/HoverHelp.tsx` and `lib/popover/position.ts`, so this diff fires the gate. **The new `lib/popover/viewport.ts` MUST be added to that path list** in the same commit that creates it — otherwise a later change to the file that breaks zoom geometry would not fire the only gate that can catch it. This is the whole reason the file placement decision (§4.1) is a spec item rather than an implementation detail.

## §7 Acceptance criteria

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-1 `lib/popover/viewport.ts` exports `visibleViewportRect(win: Window): Rect` satisfying every row of the §4.1 guard table.
- AC-2 `components/admin/HoverHelp.tsx` builds its bounds from `visibleViewportRect(window)`; no `window.innerWidth`/`innerHeight` read remains in that file.
- AC-3 `visualViewport` `scroll` and `resize` feed the existing `schedule()` coalescer and are removed symmetrically on close.
- AC-4 `lib/popover/position.ts` is unmodified (R6).
- AC-5 Unzoomed geometry is unchanged — proven by T-U7 (unit) and T-VV3 (real engine), and by every pre-existing assertion in `tests/e2e/hoverhelp-geometry.spec.ts` continuing to pass.
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-6 `lib/popover/viewport.ts` appears in the `hoverhelp-geometry-e2e.yml` path filter.
- AC-7 `BACKLOG.md` row `BL-HOVERHELP-VISUAL-VIEWPORT` is marked closed with the PR reference.
- AC-8 `2026-07-22-hoverhelp-smart-position` §1.1 R8 carries a superseded-by pointer to this spec.
- AC-9 The impeccable critique + audit pair has run on the diff (AGENTS.md invariant 8; `components/admin/HoverHelp.tsx` is a UI surface by path), with dispositions recorded in the PR body.

## §8 Out of scope

- WebKit/iOS live verification (R5).
- `visualViewport`-aware positioning for anything other than `HoverHelp` — §2's sweep confirms no other positioning consumer exists.
- Any change to which side the popover opens on, its width token, or its copy.
