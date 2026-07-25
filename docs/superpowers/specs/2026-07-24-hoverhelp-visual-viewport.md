# Popover placement against the visual viewport under pinch-zoom

**Date:** 2026-07-24
**Status:** round 5. Rounds 1-4 all returned BLOCKING. Round 3 identified the **third consecutive recurrence** of one vector, which triggers the project's hard stop (`docs/agents/writing-plans.md:19-20`, `docs/agents/spec-self-review.md:22`): stop patching prose, declare the vector unresolved, descope. Round 4 descoped but its replacement rule was ALSO a boundary guess, and round 4's review refuted it with a concrete counterexample — the FOURTH occurrence of the vector. Round 5 stops guessing boundaries entirely and closes the vector with a PROPERTY (R14).
**Closes:** `BL-HOVERHELP-VISUAL-VIEWPORT` (BACKLOG.md:43-49)
**Supersedes:** `2026-07-22-hoverhelp-smart-position` §1.1 R8 (that spec's line 30)
**Autonomy:** user approved autonomous ship-through-to-merged-PR (2026-07-24, brainstorming gate); spec + plan user-review gates waived.

---

## §1 Problem

Both popover consumers build their bounds rectangle from the LAYOUT viewport — `components/admin/HoverHelp.tsx:226-239` and, byte-for-byte the same shape, `components/admin/showpage/ShareHub.tsx:247-258`:

```ts
const viewportRect: Rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: …, bottom: … };
const hostRect = host === document.body ? viewportRect : toRect(host.getBoundingClientRect());
const bounds = insetRect(intersectRects(hostRect, viewportRect), VIEWPORT_INSET);
```

Pinch-zoom does not change the layout viewport (§3.1, measured). It changes the VISUAL viewport: a smaller, offset window onto the same layout. So an open popover is placed inside a rectangle that is partly off-screen, and the missing text cannot be scrolled to. Zoom-pan also does not fire `window`'s `scroll` event (§3.1: `scrollX/scrollY` stay `0,0` through a full pan), so an open popover does not follow as the user pans.

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|----------|--------------|
| R1 | **The visible slice becomes the bounds for BOTH sizing and position** while the anchor is on screen (see R4). Under zoom the popover narrows, wraps taller, and scrolls past its `maxHeight` cap. Rejected: clamping position only (leaves the right side permanently cut off with no scroll), and a fits-or-fallback threshold (never engages at the zoom levels that cause the problem) | User choice, brainstorming 2026-07-24, against a rendered mockup of all three at 1.5x and 3.5x |
| R2 | Supersedes `2026-07-22-hoverhelp-smart-position` §1.1 R8, which filed this successor itself | smart-position spec line 30; BACKLOG.md:43-49 |
| R3 | **Narrowing is not a regression.** At 3.5x the visible slice is ~111 CSS px wide, so the popover is a narrow scrolling column — magnified 3.5x on screen, so its text is LARGER than unzoomed, and every word stays reachable by scrolling. A width floor was rejected: it would guarantee horizontal overflow with no horizontal scroll, i.e. permanently unreachable text | Brainstorming 2026-07-24 |
| R4 | **The bounds are chosen by OUTCOME, not by a boundary test.** Round 3 rescinded the original hide-on-pan rule; round 4 replaced it with "use the visible slice while the trigger positively overlaps it", and round 4's review refuted THAT too: the helper tested overlap against the RAW visual rect while the core tests the INSET one, so a trigger overlapping by less than `VIEWPORT_INSET` newly went `hidden` at all four edges — and the core's vertical-space gate could fire independently on a short slice. Four boundary guesses, four refutations. **The rule is now: compute the placement with visible-slice bounds; if that placement is `hidden`, recompute with today's layout bounds and use that.** The result is `hidden` only when today's code would also hide — by construction, at every edge, for every gate in the core including gates that do not exist yet | Round 4 F1; four-round rule |
| R5 | **WebKit is EXCLUDED and keeps today's behavior.** On WebKit with an absolute-positioned floating element, client coordinates are visual-viewport-relative (§3.4), which would also require changing the body-host conversion `pt.x + window.scrollX` (HoverHelp.tsx:283-290); Playwright's WebKit exposes no CDP, so none of it is verifiable here. **After R4, the exclusion has exactly two surfaces** — the bounds rect and the listener subscription — because nothing else in either consumer changes. That is why this round can state the exclusion is whole and mean it: the surface count went DOWN. Re-opening requires a real iOS Safari measurement | Rounds 1-3 F1; §3.4 |
| R6 | **`lib/popover/position.ts` is not modified.** `bounds` is already an input (:46); every consequence of a smaller bounds rect falls out of the shipped algebra | lib/popover/position.ts:100-156 |
| R7 | **Scale 1 is a no-op ONLY when the visual viewport equals the layout viewport.** Classic (non-overlay) scrollbars and an on-screen keyboard both break that equality with no zoom at all. In both, the popover is then bounded by the genuinely visible area — an intended improvement, ratified here rather than asserted away. Guaranteed: given equal dimensions and zero offsets, the returned rect is deep-equal to today's (T-U7) | Round 1 F2; §3.5 |
| R8 | No new visual states, no new rendered elements, no new copy, no new tokens. **After R4 this is literally true** (§4.7), where in round 3 it was contradicted by the ShareHub state machine R11 introduced | Round 3 F5 |
| R9 | **Below the popover's own irreducible box, bounds are exceeded rather than obeyed.** `max-width` cannot shrink a border box below padding + border: HoverHelp `2*(14+1) = 30px` (`p-3.5` + `border`, HoverHelp.tsx:576), ShareHub `2*(10+1) = 22px` (`p-2.5` + `border`, ShareHub.tsx:699). Reachable only past ~10x zoom, where the popover is unusable whichever way it is placed. The popover stays placed and anchored and may exceed the bounds there; a hardcoded floor constant would rot against the class strings | Round 1 F3; CSS Sizing 3 |
| R10 | **`ShareHub` is IN SCOPE.** It builds the identical viewport rect (:247-258), uses the identical host model, and calls the same `computePopoverPlacement` (:275). The round-1 sweep that missed it had been run in a stale checkout. After R4, ShareHub's change is exactly HoverHelp's — one rect call and one gated listener pair, with **no change to its hidden branch, focus handling, or busy machinery** | Round 1 F6; round 3 F1/F2 |
| R11 | **DELETED (round 3).** R11 formerly specified a ShareHub collision-hidden focus contract. R4's rescission removes the state that made it necessary. Round 3 F2 showed that contract was also wrong on its own terms — declining to hide while busy leaves stale `left`/`top` with the visible-slice caps already cleared (ShareHub.tsx:260), i.e. a clipped, still-interactive dialog, and its settle transition collides with the "still open after settle" contract at `tests/components/admin/showpage/shareHub.test.tsx:992`. Both problems disappear with the state itself | Round 3 F2 |
| R12 | **The real-engine layer is authored RED, before any implementation** — the house pattern (`docs/superpowers/plans/2026-07-24-strip-mobile-stacked-band.md` Task 1). Round 3 F3 correctly added that "red" is only evidence if it is red for the RIGHT reason: §5 now requires every setup and precondition assertion to PASS and the failure to occur specifically at the coordinate verdict | Round 2 F2/F4; round 3 F3 |
| R13 | **Subscription and usability are separate questions.** Round 3 F4 found a recovery hole: a single predicate that gated BOTH produced a state where a `visualViewport` reporting zero/non-finite dimensions at open meant no listeners were ever attached, so its later `resize` could not restore tracking. Subscription is an ENGINE question, answered once per effect run (`isVisualViewportEngine`); usability is a PER-MEASURE question, answered on every frame inside the rect function. Listeners attach whenever the engine qualifies, regardless of the dimensions at that instant | Round 3 F4 |
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
| R14 | **The vector is closed by a property test, not by prose.** Four consecutive rounds found the same class, so per the project's escalation rule the structural defense ships in THIS round's commit rather than after another recurrence. `tests/lib/popover/neverNewlyHidden.test.ts` asserts `new placement is hidden IMPLIES legacy placement is hidden` over an exhaustive four-edge overlap sweep (fully-outside through 3x`VIEWPORT_INSET`), short and narrow slices that exercise the vertical-space and irreducible-box regimes, panel hosts larger and smaller than the slice, and 2000 seeded random configurations. **It was validated by injecting round 4's refuted raw-overlap rule: all nine groups fail with `left overlap=1: zoom NEWLY hid the popover — legacy placed it`,** independently reproducing round 4's counterexample. The property is checked against the CORE's own answer, so it cannot drift from the core's semantics the way four hand-derived thresholds did | Round 4 F1; escalation rule |

## §2 Current state (citations verified against worktree `fix/hoverhelp-visual-viewport`)

**Sweep** (re-run in the worktree; the round-1 version was run in a stale main checkout and missed ShareHub): `grep -rn "innerWidth\|innerHeight\|visualViewport" lib components app` →

| hit | disposition |
|---|---|
| `components/admin/HoverHelp.tsx:229-232` | IN SCOPE — consumer 1 |
| `components/admin/showpage/ShareHub.tsx:250-253` | IN SCOPE — consumer 2 (R10) |
| `components/admin/dev/DevCaptureControl.tsx:98-99` | out — records viewport size into a capture payload; positions nothing |
| `components/agenda/AgendaPdfViewer.tsx:15` | out — a comment describing removed code |

`grep -rn "computePopoverPlacement" lib components app` confirms exactly two call sites: `HoverHelp.tsx:241`, `ShareHub.tsx:275`.

- HoverHelp: measure path `measureAndApply` :218; viewport rect :226-233; host rect :238; bounds :239; host-offset conversion :283-290; hidden branch (closes + restores focus) :254-275; listeners :332-337 with teardown :339-344; coalescer `schedule()` :314-320.
- ShareHub: viewport rect :247-253; host rect :257; bounds :258; placement :275; hidden branch :290-300 (**visibility only** — its comment scopes it to "degenerate/unlaid-out rects (SSR, jsdom, mid-unmount)"; R4 leaves it untouched); listeners `window` `resize` :372 with teardown :404, plus two guarded `ResizeObserver`s (:378, :393). ShareHub has no `window` `scroll` listener — pre-existing, out of scope (§8).
- Popover boxes: HoverHelp `p-3.5` + `border` :576; ShareHub `w-[308px]`, `p-2.5` + `border` :699 (the R9 floors).
- Pure core: `computePopoverPlacement` :100; `bounds` documented :46; `VIEWPORT_INSET = 8` :17; `GAP = 6` :16; hidden gates :104-115 (`overlapsPositively` :112); width-first sizing :118-121; x-clamp :138-139; `intersectRects` exported :65; `Rect` :30-37.
- Harness: `tests/e2e/hoverhelp-geometry.spec.ts` + `tests/e2e/_hoverHelpGeometryLiveEntry.tsx`, standalone via `tests/e2e/standalone.config.ts` (`standalone-chromium`, `devices["Desktop Chrome"]` — no touch), script `pnpm test:e2e:hoverhelp-geometry` (package.json:60). Allow-list already contains `hoverhelp-geometry`. Body-host cases and panel-host cases both exist (`PaneCase` :112, `NarrowPaneCase` :83). Helpers: `open(page, case, triggerId)`, `box(page, testid)`, `TOL = 0.5`.
- CI: `.github/workflows/hoverhelp-geometry-e2e.yml` lists `components/admin/HoverHelp.tsx` and `lib/popover/position.ts`, plus `workflow_dispatch`. It does NOT list ShareHub or the new module (§6).

## §3 Empirical probe (ran 2026-07-24, pre-spec)

### §3.1 Mobile context (`viewport 390x780`, `isMobile`, `hasTouch`, `dSF 2`)

| state | `innerWidth/Height` | `vv.width/height` | `vv.offsetLeft/Top` | `scrollX/Y` | element rect |
|---|---|---|---|---|---|
| baseline | 390 / 780 | 390 / 780 | 0 / 0 | 0 / 0 | 170, 360 |
| `setPageScaleFactor 3` | 390 / 780 | 130 / 260 | 0 / 0 | 0 / 0 | 170, 360 |
| after pan | 390 / 780 | 130 / 260 | 0 / 150 | 0 / 0 | 170, 360 |
| `synthesizePinchGesture 2.5` | 390 / 780 | 156 / 312 | 117 / 234 | 0 / 0 | 170, 360 |

(a) the layout viewport is invariant under zoom; (b) `visualViewport` reports the visible slice and its offset; (c) **`getBoundingClientRect()` is layout-viewport-relative in Chromium** — the probe element's rect never moved, for `absolute` AND `fixed`; (d) `scrollX/scrollY` never change, so `window` `scroll` cannot carry a zoom-pan; (e) one pan emitted **80** `visualViewport` events, so the existing rAF coalescer is load-bearing.

### §3.2 Desktop context — EXACTLY the CI project (`devices["Desktop Chrome"]`, no touch)

| state | `innerWidth/Height` | `vv` w/h/offL/offT/scale | element rect |
|---|---|---|---|
| baseline | 1280 / 720 | 1280 / 720 / 0 / 0 / 1 | 170, 360 |
| `Emulation.setPageScaleFactor 3` | 1280 / 720 | 426.7 / 240 / 0 / 0 / 3 | 170, 360 |
| `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`) | 1280 / 720 | 426.7 / 240 / 120 / 180 / 3 | 170, 360 |
| `Input.synthesizePinchGesture` | unchanged — **no-op without touch** | | |

**This is why §5 drives `setPageScaleFactor` + `synthesizeScrollGesture(mouse)`, never `synthesizePinchGesture`** — under the shipped touchless project the pinch gesture silently does nothing, producing a test that passes while proving nothing.

### §3.3 WebKit coordinate convention — upstream source read

Verbatim from the Floating UI `getViewportRect` utility (fetched 2026-07-24, `master`):

```ts
// Client coordinates are relative to the layout viewport, except in
// WebKit with an `absolute` strategy, where they are relative to the
// visual viewport.
const layoutRelativeClientCoords = !isWebKit() || strategy === 'fixed';
```

with `isWebKit()` = `CSS.supports('-webkit-backdrop-filter', 'none')`. The non-WebKit branch matches §3.1/§3.2 exactly, which is the evidence the read is applied correctly. The detector was also measured, not assumed: probe 1 evaluated it in Chromium and got **false**, so Chromium's aliasing of `-webkit-` prefixed properties does not misfire the gate.

### §3.4 States where the visual viewport differs from the layout viewport at scale 1

Documented (MDN `VisualViewport`; Chromium WPT `viewport-dimensions-scrollbars-manual`): classic non-overlay scrollbars, where `innerWidth` includes a gutter `visualViewport.width` excludes; and an on-screen keyboard. **Not reproduced here:** a probe launched headless Chromium with default flags and with `--disable-features=OverlayScrollbar,FluentOverlayScrollbar` over a 4000px-tall page; both reported `innerWidth 1280` / `visualViewport.width 1280`, delta 0. Recorded as documented-but-unreproduced; R7 ratifies the behavior either way.

## §4 Design

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
### §4.1 New module `lib/popover/viewport.ts` — what the rects ARE

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
Three exports, no policy. Lives outside `lib/popover/position.ts` because that module's contract is pure placement algebra with no environment reads (:1-14); this one reads the window, so it takes the window as a parameter and tests inject a plain stub.

```ts
/** ENGINE question, answered once per effect run: may we subscribe at all? (R13) */
export function isVisualViewportEngine(win: Window): boolean;
/** Today's rect. */
export function layoutViewportRect(win: Window): Rect;
/** The visible slice, or null when this engine or this instant has no usable one. */
export function visualViewportRect(win: Window): Rect | null;
```

`isVisualViewportEngine` = not WebKit AND `win.visualViewport` present. Deliberately nothing about dimensions (R13): a viewport that is momentarily degenerate must still be subscribed to, or its recovery event can never arrive.

`visualViewportRect` returns `null` for WebKit (R5), for a missing API, and for non-finite or non-positive dimensions; otherwise the slice with origin `(finiteOr0(offsetLeft), finiteOr0(offsetTop))`. Non-finite offsets coerce to `0` with the size retained.

**Guard table** (every input state):

| input state | `isVisualViewportEngine` | `visualViewportRect` | why |
|---|---|---|---|
| WebKit | false | null | R5; callers use the layout rect, i.e. today's behavior |
| `visualViewport` absent or null | false | null | preserves today's behavior |
| dimensions `NaN` / `Infinity` / `<= 0` | **true** | null | R13 — still subscribe, so recovery can arrive; but this instant is unusable |
| offsets non-finite | true | rect with origin `0,0` | partial degradation beats total |
| `win.CSS` or `CSS.supports` undefined | true | rect | matches every engine lacking `CSS.supports` |
| vv equals the layout viewport | true | rect deep-equal to `layoutViewportRect` | the R7 guarantee (T-U7) |

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
### §4.2 New module `lib/popover/place.ts` — which bounds, and the guarantee

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
ONE function that both consumers call, so the policy cannot drift between them — the drift that produced round 1 F6 (ShareHub missed) and round 4 F3 (two trigger snapshots).

```ts
export type PlaceInput = Omit<PopoverPlacementInput, "bounds"> & {
  /** Host rect, or null for the body host (which degenerates to the viewport). */
  hostRect: Rect | null;
};

export function placeWithinVisibleViewport(win: Window, input: PlaceInput): PopoverPlacement;
```

Body:

1. `bounds(viewport) = insetRect(intersectRects(hostRect ?? viewport, viewport), VIEWPORT_INSET)` — identical composition to today's, so the host model is unchanged.
2. `visual = visualViewportRect(win)`. If `null` → return `computePopoverPlacement` with layout bounds. Today's answer, exactly.
3. Otherwise compute with visual bounds. **If that result is `hidden`, recompute with layout bounds and return THAT** (R4).

Step 3 is the whole guarantee, and it is an outcome test rather than a geometric one precisely because four geometric guesses failed. The trigger rect enters ONCE, via `input.trigger`, and both the bounds decision and the placement consume that same snapshot — round 4 F3's ambiguity is structurally impossible.

`lib/popover/position.ts` is still unmodified (R6); this module wraps it.

### §4.3 Reposition listeners

Added to each consumer's open-effect beside its existing `window` listeners (HoverHelp :332-333; ShareHub :372):

```ts
const vv = isVisualViewportEngine(window) ? window.visualViewport : null;
vv?.addEventListener("scroll", schedule);
vv?.addEventListener("resize", schedule);
```

removed symmetrically in the same cleanup block (HoverHelp :339-340; ShareHub :404). `vv` is captured once in the effect body and reused by the cleanup closure, so add and remove cannot target different objects; `schedule` is the single instance that effect run captured.

Gating on the ENGINE, not on current usability, is R13: a viewport reporting zero dimensions at open is still subscribed, so its later `resize` restores tracking. On WebKit nothing is attached at all, so a zoom-pan schedules no re-measurement — today's behavior.

Existing `window` listeners stay: they carry ordinary document scrolling and window resizes, which visual-viewport events do not replace.

### §4.4 Consequences

| situation | behavior | mechanism |
|---|---|---|
| unzoomed, visual == layout | identical to today | §4.1 step 5 equality |
| unzoomed, scrollbars/OSK shrink the visual viewport | bounded by the genuinely visible area — intended (R7) | §4.1 step 5 |
| WebKit, any zoom | identical to today; no rect change, no listeners | §4.1 step 1, §4.3 |
| zoomed, anchor on screen, popover fits | placed fully inside the visible slice, possibly narrower | position.ts:118-121 |
| zoomed, anchor on screen, popover taller | `maxHeight` cap + internal scroll | position.ts:130-133 |
| zoomed past ~10x, bounds below the irreducible box | stays placed and anchored, exceeds bounds | R9 |
| user pans while the anchor stays on screen | repositions on the next frame | §4.3 |
| **any state where visible-slice bounds would hide the popover** | **falls back to layout bounds — today's answer. Never newly hidden** | **R4, proven by the property suite** |
| host scrolls the anchor out of its pane | hides, exactly as today | unchanged; `hostRect`, not the viewport rect (T3e) |
| no `visualViewport` | today's behavior exactly | §4.1 step 1 |

### §4.5 Numeric inventory

`VIEWPORT_INSET = 8` and `GAP = 6` (position.ts:17,16) govern placement; this spec introduces **no new numeric constant**. The R9 floors (30px, 22px) are DERIVED from committed class strings and are documentation, not values any implementation may hardcode. Every figure in §3 is probe output.

### §4.6 Dimensional Invariants

**None — no dimension relationship is introduced.** Answered rather than waived because both changed files are UI paths. Neither popover body's box changes (HoverHelp `w-72 max-w-[80vw] max-h-[min(60vh,24rem)]` :576; ShareHub `w-[308px] max-h-[min(70vh,30rem)]` :699). The only geometry written is `left`/`top`/`maxWidth`/`maxHeight` as inline styles on `position: absolute` elements in no flex or grid parent, so the Tailwind-v4 `align-items` caveat has no surface here. The one box-model fact that bites is R9's padding+border floor, pinned in §5.

### §4.7 Transition Inventory

**None — no visual state and no state transition is introduced.** In round 3 this claim was false, because R11 added a ShareHub state machine; R4's rescission and R11's deletion make it true. Each popover's three states (closed, open-and-placed, open-but-collision-hidden) and every transition between them are unchanged, as is their fade treatment (HoverHelp.tsx:576-578, :622-624). Zoom and pan change only WHERE a state is painted, never WHICH state is active — and per R4, zoom can no longer cause an entry into collision-hidden that does not already occur today.

### §4.8 Deliberately N/A

Tier x domain matrix and CHECK/enum matrix (no DB surface); flag lifecycle table (no toggle); cap/truncation (no list); §12.4 catalog (no error code, no user-visible copy); mutation-surface telemetry, invariant 10 (nothing mutated); advisory locks, invariant 2 (no DB path).

## §5 Tests

Anti-tautology governs every assertion: expected values derive from live measurements and exported constants, never literals.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Unit — `tests/lib/popover/viewport.test.ts` (new).** One case per §4.1 guard-table row (T-U1..T-U8, T-U10) on plain object stubs. It pins what the rects ARE; it deliberately contains no bounds policy.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Property — `tests/lib/popover/neverNewlyHidden.test.ts` (new). THE structural defense (R14).** Asserts `placeWithinVisibleViewport(...).kind === "hidden"` IMPLIES the legacy layout-bounds placement is also `hidden`, over: an exhaustive overlap sweep at all four edges from fully-outside through 3x`VIEWPORT_INSET`; short slices (the core's vertical-space gate) and narrow slices (the R9 irreducible-box regime); panel hosts larger than, smaller than, and offset from the slice; and 2000 seeded random configurations, replayable by seed. **Validated by injecting round 4's refuted raw-overlap rule — all nine groups fail with `left overlap=1: zoom NEWLY hid the popover — legacy placed it`.** Checked against the core's own answer, so it cannot drift from the core's semantics.

**Unit — `tests/lib/popover/position.test.ts` (extend).** Characterization pins on UNMODIFIED core (R6). **Not TDD and not claimed to be** — invariant 1 forbids implementation before its test, which a task with no implementation cannot violate. Narrow bounds → `placed` with both caps (R3); bounds below the R9 floor → still `placed`; and a discrimination pin showing layout-bounds and visual-bounds inputs yield DIFFERENT placements.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Component — `tests/components/admin/hoverHelpVisualViewport.test.tsx` (new, jsdom).** Reuses the `stubRect` idiom at `tests/components/admin/hoverHelpLifecycle.test.tsx:157`. The stubbed slice is smaller than AND offset from the layout viewport, so a layout-viewport implementation and a visual-viewport one cannot agree.
- T-C1 applied `left`/`top`/`maxWidth`/`maxHeight` land inside the stubbed slice inset by `VIEWPORT_INSET`, all derived, plus a negative assertion naming the value the old code would have written.
- T-C2 both event types independently: `scroll` schedules exactly one frame; `resize` schedules one; either while CLOSED schedules none.
- T-C3 after close, dispatching both types **on the originally captured viewport object** schedules no frame.
- T-C4 no `visualViewport` → still opens and positions against the layout viewport.
- T-C5 WebKit-shaped stub → placement matches the layout-viewport answer **and no `visualViewport` listener is attached at all** (`addEventListener` spy).
- **T-C6 (R4)** with the trigger stubbed outside the visible slice, the popover is placed against the LAYOUT viewport and is **not** hidden — `data-popover-hidden` absent, `visibility` not `hidden`. The component-level companion to the property suite. **Empirically validated:** applying the implementation and rendering this exact case produced a placed popover at `trigger.bottom + GAP`, not a hidden one.
- **T-C7 (R13)** open with a stubbed viewport reporting zero dimensions, then restore valid dimensions and dispatch `resize`: placement recovers and pan tracking works. The recovery hole round 3 F4 found, asserted end to end.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Component — `tests/components/admin/showpage/shareHubVisualViewport.test.tsx` (new, jsdom).** ShareHub is a full consumer, not a satellite of HoverHelp's coverage:
- T-S1 body-host bounds, as T-C1.
- T-S2/T-S3 listener attach and post-close inertness of the original object.
- T-S4 **panel host** under `PopoverHostContext` with NON-ZERO `clientLeft`/`clientTop` and `scrollLeft`/`scrollTop`, asserting exact host-relative coordinates — a ShareHub-only regression ignoring the panel intersection would otherwise pass the source guard, the body-host test, and HoverHelp's panel e2e simultaneously.
- T-S5 WebKit-shaped stub → no listener attached (T-C5's twin; the class swept across both consumers).
- **T-S6 (R4/R10)** trigger outside the visible slice → placed against the layout viewport, **and ShareHub's hidden branch is not entered**: `visibility` is not `hidden`, `open` stays true, focus is untouched.
- **T-S7 (R13)** ShareHub's own zero-dimension recovery: open while the viewport reports zero dimensions, restore valid dimensions, dispatch `resize` on the ORIGINAL object, and prove placement recovers. Round 4 F2 is right that T-C7 proves this for HoverHelp only, and that every other ShareHub test plus all Chromium e2e cases (which render HoverHelp) would survive a ShareHub-only regression here.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
**Structural — `tests/components/admin/_metaPopoverViewportSource.test.ts` (new).** DISCOVERS consumers by walking `components/` and `app/` for `computePopoverPlacement` call sites — never a hardcoded list, because a stale hardcoded view of `who positions popovers` is exactly what hid ShareHub in round 1. Comments are stripped before scanning. Asserts: the walk finds both known consumers (so per-file assertions cannot vacuously pass on an empty list), no consumer reads `window.innerWidth/innerHeight`, every consumer uses `placementViewportRect`. **Pre-verified against the live tree:** discovery passes, four per-consumer assertions fail — the correct red.

**e2e — `tests/e2e/hoverhelp-geometry.spec.ts` (extend; already in the allow-list).** Chromium, via `context.newCDPSession(page)`, driven with `Emulation.setPageScaleFactor` + `Input.synthesizeScrollGesture` (`gestureSourceType: "mouse"`).

Authored FIRST and demonstrated RED (R12). **Round 3 F3 is binding: a red run is evidence ONLY if every setup and precondition assertion passed and the failure landed on the coordinate verdict.** Each case therefore asserts, in order: (1) the gesture moved `visualViewport` (`scale > 1`, offsets non-zero); (2) the fixture's popover is present and open; (3) the **discrimination precondition** — the pre-zoom rect, which is exactly what the layout-viewport implementation leaves on screen because `window` scroll never fires on a zoom-pan (§3.1), is NOT inside the zoomed visual viewport; only then (4) the exact-coordinate verdict. "Old placement" is pinned to the **pre-zoom natural box**, not an implementation-constrained post-zoom box.
- **T-VV1 (body host)** exact `left`/`top` against an in-page recomputation from the live visual rect, live trigger rect, `GAP`, `VIEWPORT_INSET`, within `TOL`.
- **T-VV2 (panel host)** the same against the existing `PaneCase` fixture (`_hoverHelpGeometryLiveEntry.tsx:112`); bounds are `panel ∩ visible slice`.
- **T-VV3 (pan tracking)** a second pan moves the offsets further and the popover follows.
- **T-VV4 (unzoomed restore)** `setPageScaleFactor 1` returns the popover to its pre-zoom rect. **This case is GREEN against unmodified code by design** — it pins the R7 no-op guarantee, which the layout-viewport implementation already satisfies. The RED layer is therefore three discriminating failures plus one no-op guard, and any report claiming 4/4 red is wrong.
- Teardown resets page scale to 1 so a failure cannot leak zoom state into later tests in this serial file.

**Note on the harness's `getBoundingClientRect` ban.** That file bans it as a CLIPPING/visibility proof (:19-21) and uses `document.elementFromPoint`. These assertions are viewport-coordinate arithmetic, not clipping proofs, and `elementFromPoint` cannot express them — its coordinates are visual-viewport-relative under zoom while rects are layout-relative (§3.1), so mixing them would be the actual error.

## §6 CI wiring

Two entries MUST be added to `.github/workflows/hoverhelp-geometry-e2e.yml`'s `pull_request` path filter in the same commit that creates or changes them, or a later edit will not fire the only gate that can catch a zoom-geometry regression:

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- `lib/popover/viewport.ts`
- `components/admin/showpage/ShareHub.tsx`

`tests/e2e/_hoverHelpGeometryLiveEntry.tsx` is already listed. ShareHub is otherwise covered by the standard vitest suite; no workflow gates it today.

## §7 Acceptance criteria

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-1 `lib/popover/viewport.ts` exports `isVisualViewportEngine`, `layoutViewportRect`, and `visualViewportRect` satisfying every row of the §4.1 guard table.
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-1b `lib/popover/place.ts` exports `placeWithinVisibleViewport`, and it is the ONLY place either consumer decides which bounds to use.
- AC-2 Both consumers obtain their placement from `placeWithinVisibleViewport(window, …)`, passing ONE trigger snapshot; no `window.innerWidth`/`innerHeight` read remains in either.
- AC-3 Both attach `visualViewport` `scroll`/`resize` gated on `isVisualViewportEngine`, removed symmetrically, proven by post-close inertness of the original object.
- AC-4 Neither consumer attaches any `visualViewport` listener when the engine does not qualify (T-C5, T-S5).
- AC-5 `lib/popover/position.ts` is unmodified (R6).
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-6 **Zoom never newly enters a hidden branch**, proven as a PROPERTY over the sweep in `tests/lib/popover/neverNewlyHidden.test.ts` (R14), with T-C6/T-S6 as component-level companions; host-driven hiding is unchanged (existing T3e passes untouched).
- AC-7 Equal-dimension no-op proven by T-U7 and T-VV4; the non-equal scale-1 states are ratified as intended (R7).
- AC-8 A degenerate-at-open visual viewport still subscribes and recovers, in BOTH consumers (T-U10, T-C7, T-S7).
<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- AC-9 `lib/popover/viewport.ts` and `components/admin/showpage/ShareHub.tsx` appear in the `hoverhelp-geometry-e2e.yml` path filter.
- AC-10 `BACKLOG.md` row marked closed citing THIS SPEC's path (the PR does not exist at that commit; the PR body carries the reverse link).
- AC-11 `2026-07-22-hoverhelp-smart-position` §1.1 R8 carries a superseded-by pointer.
- AC-12 The impeccable critique + audit pair has run on the diff (invariant 8), dispositions in the PR body.
- AC-13 The real-engine layer was authored and observed RED before any implementation commit, with every setup and precondition assertion passing and the failure on the coordinate verdict (R12 / round 3 F3).

## §8 Out of scope

- **WebKit / iOS Safari** (R5) — excluded by design, not overlooked.
- **Any change to either consumer's collision-hidden branch, focus handling, or busy machinery** (R4, R11) — the state is no longer newly reachable, so nothing there needs to change. ShareHub's hidden-branch design assumption (that hidden is transient) is left exactly as it is.
- ShareHub's missing `window` `scroll` listener — pre-existing asymmetry, unrelated to zoom.
- Any change to which side a popover opens on, its width token, or its copy.
